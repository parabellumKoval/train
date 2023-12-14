<script setup>
import _union from 'lodash.union'
import moment from 'moment'
import momentDurationFormatSetup from 'moment-duration-format'

import json_data_stations from '~/json/stations.json'
import json_data_ways from '~/json/ways.json'
import json_readiness from '~/json/readiness.json'
import json_readiness_results from '~/json/readiness_results.json'

const {t} = useI18n()
momentDurationFormatSetup(moment)


const stations = json_data_stations
const allWays = json_data_ways
const readiness = json_readiness
const readinessResults = json_readiness_results

const loading = ref({
  active: false,
  progress: 0
})

const loadingMultiple = ref({
  active: false,
  step: 30
})

const settings = ref({
  step: 15,
  trains: 20,
  deep: 200
})

// Results
const tableSteps = ref(15)
const isCostTable = ref(false)
const trains = ref([])
const trainsMultiple = ref({})
// Table of readiness (cargo)
const readinessData = ref([])
// Selected (clicked) readiness data row
const selectedRows = ref([])

const ways = ref([])
const cargoGroups = ref([])
// Meta data for cargo and trains
const cargosMeta = ref({})

const setup = {
  e: 371.8066,
  v: 50,
  limits: {
    // How long train can wain before arrive
    startDelayMinutes: 0,
    //
    connectionMinutes: 30,
    // How mach cargo can wait
    delayMinutes: 2 * 60,
    // Max vagons connected to train
    vagons: 45,
    // 24 Hours max distance
    distance: 24 * 50,
    // 24 Hours max in minutes
    minutes: 24 * 60,
  }
}


// COMPUTEDS
const steps = computed(() => {
  const steps = []

  for(let i = 30; i <= 180; i += settings.value.step)
    steps.push(i)

  return steps
})

const readinessSortedByDateTime = computed(() => {
  return JSON.parse(JSON.stringify(readinessData.value)).sort((a, b) => {
    if(moment(a.date).unix() > moment(b.date).unix()) {
      return 1
    }else {
      return -1
    }
  })
})

const readinessSorted = computed(() => {
  return readinessSortedByDateTime.value
})


// Calculate price for cargo
const priceCalc = (cargo, group) => {
  let distsJoinsSum = 0
     
  for(let p = 0; p < cargo.dists.length; p++) {
    const point = cargo.points[p+1]
    const dist = cargo.dists[p]

    const pointDitale = group.pointDitales.find((item) => {
      if(item.point === point)
        return item
    })

    const value = dist / pointDitale.count
    distsJoinsSum += value
  }

  const price = 1.813 * (
    cargo.vagons * (561.3 + 466.1 + 39.4 * (cargo.from === group.from? 0: 1) + 466.1)
      +
      371.8 * distsJoinsSum
  )

  return Math.round(price)
}

// Calc price for whole train
const priceTrainCalc = (train) => {
  const startVagons = train.cargoList.filter((item) => {
    if(item.from === train.from)
      return true
    else
      return false
  }).reduce((common, item) => {
    return common + item.vagons
  }, 0)

  const connectionVagons = train.cargoList.filter((item) => {
    if(item.from !== train.from)
      return true
    else
      return false
  }).reduce((common, item) => {
    return common + item.vagons
  }, 0)

  const price = (561.3 + 466.1 + 466.1) * (startVagons + connectionVagons) + 371.8 * train.distance + 39.4 * (startVagons + connectionVagons)
  return price
} 

// Set unique trains
const setTrains = async () => {

  const uniqueTrains = []
  const uidsObject = readinessSorted.value.reduce((arr, curr) => {
    return { ...arr, [curr.uid]: {
      count: 0,
      item: curr
    }}
  }, {})

  const uidsArray = []


  // const uniqCargoGroups = cargoGroups.value.filter((item) => {
  //   return item.uniques > 1
  // })

  var start = performance.now();
  const sortedCargoGroups = cargoGroups.value.sort((a, b) => {
    if(a.uniques + a.cargoList.length > b.uniques + b.cargoList.length) {
      return -1
    }else {
      return 1
    }
  })

  if(!sortedCargoGroups.length)
    return []

  for(let i = 0; i < sortedCargoGroups.length; i++) {

    const uids = sortedCargoGroups[i].uids
    const cargoIntersection = uids.filter(uid => uidsArray.includes(uid))
    // const cargoIntersection = uids.filter(uid => !uidsArray.includes(uid))
    
    // skip if even one cargo already has train (ЭТА ПРОВЕРКА НЕ ВСЕГДА ПРОХОДИТСЯ КОРРЕКТНО)
    if(cargoIntersection.length > 0)
      continue

    uniqueTrains.push(sortedCargoGroups[i])
    uidsArray.push(...uids)

    for(let u = 0; u < uids.length; u++){
      if(uidsObject[uids[u]] !== undefined) {
        uidsObject[uids[u]].count += 1
      }
    }
  }

  var end = performance.now();
  var time = end - start
  // console.log('Performance', time)

  // Fill Empty values
  for (const [key, value] of Object.entries(uidsObject)) {
    if(value.count === 0) {
      // console.log('Fill Empty values')
      await useWay().getVariants(value.item.from, value.item.to).then((data) => {
        data.sort((a,b) => {
          if(a.distance > b.distance)
            return 1
          else
            return -1
        })

        const cargo = getCargoGroup(data[0], value.item)
        uniqueTrains.push(cargo)
      })
    }
  }

  // Replace one-cargo-train to shortest way
  for(let j = 0; j < uniqueTrains.length; j++) {
    if(uniqueTrains[j].cargoList.length === 1) {
      await useWay().getVariants(uniqueTrains[j].from, uniqueTrains[j].to).then((data) => {
        data.sort((a,b) => {
          if(a.distance > b.distance)
            return 1
          else
            return -1
        })

        console.log('cargo', data[0])
        //uniqueTrains[j].readiness
        const cargo = getCargoGroup(data[0], {
          vagons: uniqueTrains[j].cargoList[0].vagons,
          date: uniqueTrains[j].fromDate,
          from: uniqueTrains[j].from,
          to: uniqueTrains[j].to,
        })
        uniqueTrains[j] = cargo
      })
    }
  }



  // Price calculation
  for(let t = 0; t < uniqueTrains.length; t++) {
    for(let j = 0; j < uniqueTrains[t].cargoList.length; j++) {
      const cargo = uniqueTrains[t].cargoList[j]
      
      const price = priceCalc(cargo, uniqueTrains[t])

      uniqueTrains[t].cargoList[j].price = price
    }
  }

  uniqueTrains.sort((a,b) => {
    if(moment(a.fromDate).diff(moment(b.fromDate), 'm') > 0){
      return 1
    }else {
      return -1
    }
  })

  console.log('cargos', uidsObject, uidsArray, uniqueTrains)

  loading.value.active = false
  trains.value = uniqueTrains
}

// Set multiple unique trains
const setMultipleTrains = (stopTime) => {
  const uniqueTrains = {}

  // Sort trains by unique numbers of cargo
  const sortedCargoGroups = cargoGroups.value.sort((a, b) => {
    if(a.uniques > b.uniques) {
      return -1
    }else {
      return 1
    }
  })

  for(let i = 0; i < sortedCargoGroups.length; i++) {
    // train is id of first cargo
    const thisTrainId = sortedCargoGroups[i].from + '-' + moment(sortedCargoGroups[i].fromDate).unix()

    // const thisTrainId = sortedCargoGroups[i].uids[0]

    // const thisTrainId = sortedCargoGroups[i].cargoList.reduce((carry, item) => {
    //   if(item.from === sortedCargoGroups[i].from) {
    //     if(carry === '') {
    //       return item.uid
    //     }else {
    //       return carry + '-' + item.uid
    //     }
    //   }else {
    //     return carry
    //   }
    // }, '')

    console.log('thisTrainId', thisTrainId)
    
    // train stops amount
    const thisStops = sortedCargoGroups[i].uniques - 1

    // train common travel minutes
    const thisMinutes = sortedCargoGroups[i].minutes
    
    // find simular item
    if(uniqueTrains[thisTrainId] && uniqueTrains[thisTrainId][thisStops]) {
      const simular = uniqueTrains[thisTrainId][thisStops].find((item) => {
        if(item.distance === sortedCargoGroups[i].distance &&
            item.from === sortedCargoGroups[i].from &&
              item.to === sortedCargoGroups[i].to) {
                return true
              }
      })

      if(simular !== -1 && simular !== undefined)
        continue
    }

    // skip if already more then 8 trains or fill if this train has shorter distance
    if(uniqueTrains[thisTrainId] && uniqueTrains[thisTrainId][thisStops] && 
          uniqueTrains[thisTrainId][thisStops].length >= 8) 
    {
      // find longest train
      const longerTrainIndex = uniqueTrains[thisTrainId][thisStops].findIndex((t) => {
        if(t.minutes > thisMinutes)
          return true
        else
          return false
      })

      if(longerTrainIndex !== -1) {
        uniqueTrains[thisTrainId][thisStops][longerTrainIndex] = sortedCargoGroups[i]
      }

      continue
    }

    // create base object if new
    if(uniqueTrains[thisTrainId] === undefined) {
      uniqueTrains[thisTrainId] = {}
    }

    // create base if [this-train][stops-amount] not existas
    if(uniqueTrains[thisTrainId][thisStops] === undefined) {
      uniqueTrains[thisTrainId][thisStops] = []
    }
    
    // push train
    uniqueTrains[thisTrainId][thisStops].push(sortedCargoGroups[i])
    
  }

  // Price calculation

  // for each group
  for(let g = 0; g < Object.keys(uniqueTrains).length; g++) {
    const trainUids = Object.keys(uniqueTrains)
    const key = trainUids[g]

    // for each stops
    for(let s = 0; s < Object.keys(uniqueTrains[key]).length; s++) {
      
      // train
      for(let t = 0; t < uniqueTrains[key][s].length; t++) {
        
        const train = uniqueTrains[key][s][t]

        const price = priceTrainCalc(train)
        uniqueTrains[key][s][t].price = price
      }

      // Sorting by price
      uniqueTrains[key][s].sort((a, b) => {
        if(a.price > b.price)
          return 1
        else
          return -1
      })

    }
  }

  console.log('uniqueTrains', uniqueTrains)

  trainsMultiple.value[stopTime] = {}
  trainsMultiple.value[stopTime] = uniqueTrains

  loadingMultiple.value.active = false
}




// METHODS 
const findSimilarCargo = (list, cargo) => {
  return list.find((item) => {
    if(item.from === cargo.from && item.to === cargo.to && item.date === cargo.date) {
      return item
    }
  })
}

const filterWays = async (allWays, setups) => {
  const redinessLength = readinessSorted.value.length
  const variationsForCargo = {}

  var start = performance.now();

  const posibleWays = allWays.map((way) => {

    const item = {
      way: way,
      cargo: [],
      uniques: 0
    }

    for(let i = 0; i < redinessLength; i++){
      const fromIndex = way.points.indexOf(readinessSorted.value[i].from)
      const toIndex = way.points.indexOf(readinessSorted.value[i].to)

      // CHECK BY POSSIBLE STATIONS (POINTS)
      if(fromIndex !== -1 && toIndex !== -1 && fromIndex < toIndex) {
        const distance = way.dists.slice(fromIndex, toIndex).reduce((a,b) => {
          return a + b
        }, 0)

        const minutes = 60 * distance / 50

        // CHECK BASE 24 HOURS LIMIT
        if(distance <= setups.limits.distance) {

          const cargo = {
            ...readinessSorted.value[i],
            fromIndex: fromIndex,
            toIndex: toIndex,
            distance: distance,
            minutes: minutes,
            points: way.points.slice(fromIndex, toIndex),
            finishDate: moment(readinessSorted.value[i].date).add(minutes, 'm').format("YYYY-MM-DDTHH:mm")
          }

          cargo.points.push(readinessSorted.value[i].to)

          // count unique
          if(!findSimilarCargo(item.cargo, cargo)) {
            item.uniques += 1
          }

          // Count how match are way's variation for readiness item (cargo)
          if(variationsForCargo[cargo.uid]) {
            variationsForCargo[cargo.uid] += 1
          }else {
            variationsForCargo[cargo.uid] = 1
          }

          if(variationsForCargo[cargo.uid] < settings.value.deep) {
            // All posible cargo in this way
            item.cargo.push(cargo)
          }
        }

        // console.log('distance', distance, readinessSorted.value[i].from, readinessSorted.value[i].to, way.points)
      }
    }

    // Sort cargo by path (points)
    item.cargo.sort((a, b) => {
      if(a.fromIndex < b.fromIndex)
        return -1
      else
        return 1
    })

    return item
  })

  // Filter empty cargo lists and left only unique multiple cargos on the path
  ways.value = posibleWays.filter((item) => {
    if(item.cargo.length > 0) {
      return item
    }
  })

  var end = performance.now();
  var time = end - start;
  // console.log('all ways', allWays)
  // console.log('filterred ways', ways.value)
  // console.log('variationsForCargo', variationsForCargo)

  console.log('Performance', time)

  // Join cargo to train
  return await useCargo().createTrains(ways.value, setups).then((data) => {
    cargoGroups.value = data
    return data
  })

  // createTrains()

  // console.log('cargosMeta', cargosMeta.value)
  // console.log('cargoGroups', cargoGroups.value, trains.value)
}

const getWays = async (settings) => {

  const promise1 = await useWay().getVariants('A1', 'A25').then((data) => {
    return data
  })

  const promise2 = await useWay().getVariants('A25', 'A1').then((data) => {
    return data
  })

  return Promise.all([promise1, promise2]).then(async (values) => {
    const allData = [...values[0], ...values[1]]
    
    // Longest ways first
    allData.sort((a, b) => {
      if(a.distance > b.distance)
        return -1
      else
        return 1
    })

    // Calc available trains
    return await filterWays(allData, settings).then((data) => {
      return data
    })
  });

}

const getTotalRows = (data) => {
  if(!data) {
    return 1
  }
  
  const total = {
    rows: 1
  }

  Object.values(data).forEach((step) => {
    total.rows += 1

    Object.values(step).forEach((stop) => {
      total.rows += 1
    })
  })

  return total.rows
}

const calcMultipleHandler = async (stopMinutes = null) => {
  loadingMultiple.value.active = true

  let iterations = steps.value
  
  if(stopMinutes){
    iterations = []
    iterations.push(stopMinutes)
  }

  for(let i = 0; i < iterations.length; i++){
    const settings = JSON.parse(JSON.stringify(setup))

    settings.limits.delayMinutes = iterations[i]
    settings.limits.startDelayMinutes = iterations[i]
    loadingMultiple.value.step = iterations[i]

    // console.log('delayMinutes', settings.limits.delayMinutes)

    setTimeout(async () => {
      await getWays(settings).then((data) => {
        setMultipleTrains(settings.limits.delayMinutes)
      })
    }, 100)
  }
}

const calcHandler = async () => {
  loading.value.active = true

  const settings = JSON.parse(JSON.stringify(setup))
  settings.limits.delayMinutes = 2 * 60
  settings.limits.startDelayMinutes = 0

  setTimeout(async () => {
    await getWays(settings).then((data) => {
      setTrains()
    })
  }, 100)
}

const getCargoGroup = (newCargo, readiness) => {

  const minutes = 60 * newCargo.distance / 50

  const cargo = {
    ...readiness, // uid, date, speed, vagons, from, to
    ...newCargo, // distance, points, dists
    finishDate: moment(readiness.date).add(minutes, 'm').format("YYYY-MM-DDTHH:mm"),
    finishDateTotal: moment(readiness.date).add(minutes, 'm').format("YYYY-MM-DDTHH:mm"),
    minutes: minutes,
    minutesTotal: minutes,
    stops: 0,
    stopPoints: [],
    readiness: readiness
  }

  const cargoGroup = {
    cargoList:[cargo],
    uids: [cargo.uid],
    fromDate: cargo.date,
    toDate: cargo.finishDate,
    from: cargo.from,
    to: cargo.to,
    fromIndex: cargo.fromIndex,
    toIndex: cargo.toIndex,
    points: cargo.points,
    pointDitales: cargo.points.map((item) => {
      return {
        point: item,
        count: 1
      }
    }),
    distance: cargo.distance,
    minutes: cargo.minutes,
    uniques: 1
  }

  // cargoGroups.value.push(cargoGroup)
  return cargoGroup
}

const addHandler = () => {
  readinessData.value.push({
    uid: (Math.random() + 1).toString(36).substring(7),
    date: null,
    from: 'A1',
    to: 'A25',
    vagons: 1,
    speed: 0
  })
}


const selectHandler = (v) => {
  selectedRows.value = readinessData.value.flatMap((readiness, i) => {
    return readiness.date === v.date && readiness.from === v.from && readiness.to === v.to ? i : []
  });
}

const removeHandler = (index) => {
  selectedRows.value = []
  readinessData.value.splice(index, 1)
}

const selectSpeedHandler = (index, speed) => {
  readinessData.value[index].speed = speed
}

// const applySteps = () => {
//   settings.value.step = tableSteps.value
// }

const showCostTable = () => {
  isCostTable.value = !isCostTable.value
}

readinessData.value = readiness

</script>

<style src="./readiness.scss" lang="scss" scoped />
<i18n src="./messages.yaml" lang="yaml"></i18n>

<template>
  <div>
    <div class="container">
      <h2 class="mt-5">{{ t('label.h1') }}</h2>

      <div class="row justify-content-center mt-5">
        
        <!-- SETTINGS -->
        <div class="col-sm-12">
          <h5 class="mb-3 d-flex">
            <IconCSS name="ph:gear-six" size="20" class="me-1"></IconCSS>
            {{ t('label.settings') }}
          </h5>

          <div class="row">
            <!-- <div class="col-sm-2 mb-3">
              <label for="trains" class="form-label">{{ t('form.trains_amount') }}</label>
              <input v-model="settings.trains"  type="trains" class="form-control" id="trains" min="1" step="1">
            </div> -->
            <div class="col-sm-4 mb-3">
              <label for="trains" class="form-label">{{ t('label.deep') }}</label>
              <div class="d-flex align-items-center">
                <input v-model="settings.deep" type="range" class="form-range me-2" style="width:75%" id="deep" name="deep" min="50" max="5000" />
                <input v-model="settings.deep" class="form-control" style="width:25%" min="50" step="5000">
              </div>
            </div>
            <div class="col-sm-1 mb-3">
            </div>
          </div>

        </div>
      </div>

      <div class="row justify-content-center mt-5">
        
        <!-- INPUTS -->
        <div class="col-sm-12">
          <h5 class="mb-3 d-flex">
            <IconCSS name="ph:database" size="20" class="me-1"></IconCSS>
            {{ t('label.inputs') }}
          </h5>

          <div class="row">
            <div class="col-sm-2 mb-3">
              <label for="date" class="form-label">{{ t('form.date') }}</label>
            </div>
            <div class="col-sm-2 mb-3">
              <label for="vagons" class="form-label">{{ t('form.start') }}</label>
            </div>
            <div class="col-sm-2 mb-3">
              <label for="vagons" class="form-label">{{ t('form.vagons') }}</label>
            </div>
            <div class="col-sm-2 mb-3">
              <label for="vagons" class="form-label">{{ t('form.finish') }}</label>
            </div>
            <div class="col-sm-2 mb-3">
              <label for="speed" class="form-label">{{ t('form.speed') }}</label>
            </div>
          </div>

          <div
            v-for="(item, index) in readinessData"
            :key="index"
            :class="[{selected: selectedRows.includes(index)}, {empty: false}]"
            class="row form-row"
          >
            <div class="col-sm-2 my-2">
              <input v-model="item.date" type="datetime-local" class="form-control" id="date" required>
            </div>
            <div class="col-sm-2 my-2">
              <select v-model="item.from" class="form-select" required>
                <option v-for="s in stations" :key="s.name" :value="s.name">{{ s.name }}</option>
              </select>
            </div>
            <div class="col-sm-2 my-2">
              <input v-model="item.vagons"  type="number" class="form-control" id="vagons" min="1" step="1" max="100" required>
            </div>
            <div class="col-sm-2 my-2">
              <select v-model="item.to" class="form-select" required>
                <option v-for="s in stations" :key="s.name" :value="s.name">{{ s.name }}</option>
              </select>
            </div>
            <div class="col-sm-2 my-2">
              <div class="speed-wrapper">
                <div v-for="i in 5" :key="i" @click="selectSpeedHandler(index, i - 1)" :class="{active: item.speed === i - 1}">{{ i - 1 }}</div>
              </div>
            </div>
            <div class="col-sm-2 my-2 d-flex">
              <button @click="selectHandler(item)" type="button" class="btn btn-outline-dark d-flex align-items-center me-2">
                <IconCSS name="ph:magnifying-glass" size="16"></IconCSS>
              </button>
              <button @click="removeHandler(index)" type="button" class="btn btn-outline-danger d-flex align-items-center">
                <IconCSS name="ph:trash-simple" size="16" class="me-1"></IconCSS>
                {{ t('btn.remove') }}
              </button>
            </div>
          </div>

          <div class="mt-3">
            <button
              @click="addHandler"
              :class="{disabled: loading.active}"
              type="button"
              class="btn btn-lg btn-outline-dark me-2 "
            > + {{ t('btn.add') }}</button>

            <button
              @click="calcHandler"
              :class="{disabled: loading.active}"
              type="button"
              class="btn btn-lg btn-primary"
            >{{ t('btn.calc') }}</button>

            <span v-if="loading.active" class="ms-5">{{ t('message.wait') }}</span>
          </div>
        </div>

        <!-- RESULTS -->
        <div class="col-sm-12 mt-5">
          <h5 class="mb-3 d-flex">
            <IconCSS name="ph:calculator" size="20" class="me-1"></IconCSS>
            {{ t('label.results') }}
          </h5>
          
          <table v-if="!loading.active && trains.length > 0" class="custom-table">
            <tr class="custom-table-header">
              <th>Порядковий номер поїзда</th>
              <th>Станція відправлення</th>
              <th colspan="2">Дата та час відправлення поїзда</th>
              <th>Станція причеплення групи вагонів</th>
              <th colspan="2">Дата та час відправлення поїзда зі станції причеплення групи вагонів</th>
              <th>Станція через, які проходить маршрут поїзда</th>
              <th>Станція призначення</th>
              <th colspan="2">Дата та час прибуття поїзда на станцію призначення</th>
              <th>Вартість перевезення вантажів вантажовідправника</th>
              <th>Кількість вагонів з вантажем вантажовідправника</th>
              <th>Відстань перевезення</th>
              <th>Час в дорозі</th>
            </tr>
            <template v-for="(train, index) in trains" :key="index">
              <tr
                :class="{last: train.cargoList.length === 1}"
              >
                <td :rowspan="train.cargoList.length">{{ index + 1 }}</td>
                <td :rowspan="train.cargoList.length">{{ train.from }}</td>
                <td :rowspan="train.cargoList.length">{{ moment(train.fromDate).format("DD.MM.YYYY") }}</td>
                <td :rowspan="train.cargoList.length">{{ moment(train.fromDate).format("HH:mm") }}</td>
                <td >–</td>
                <td >{{ moment(train.cargoList[0].date).format("DD.MM.YYYY") }}</td>
                <td >{{ moment(train.cargoList[0].date).format("HH:mm") }}</td>
                <td>{{ train.cargoList[0].points.slice(1, train.cargoList[0].points.length - 1).join(', ') }}</td>
                <td >{{ train.cargoList[0].to}}</td>
                <td >{{ moment(train.cargoList[0].finishDateTotal).format("DD.MM.YYYY") }}</td>
                <td >{{ moment(train.cargoList[0].finishDateTotal).format("HH:mm") }}</td>
                <td class="nowrap">{{ train.cargoList[0].price }} грн</td>
                <td >{{ train.cargoList[0].vagons }}</td>
                <td >{{ train.cargoList[0].distance }} км</td>
                <td class="nowrap">{{ moment.duration(train.cargoList[0].minutesTotal, 'minutes').format('HHч mmм') }}</td>
              </tr>
              <tr
                v-for="(cargo, cargoIndex) in train.cargoList.slice(1, train.cargoList.length)"
                :key="cargo.uid"
                :class="{last: train.cargoList.length - 2 === cargoIndex}"
              >
                <td >{{ (cargo.from !== train.from)? cargo.from: '–' }}</td>
                <td >{{ moment(cargo.dateTotal).format("DD.MM.YYYY") }}</td>
                <td >{{ moment(cargo.dateTotal).format("HH:mm") }}</td>
                <td>{{ cargo.points.slice(1, cargo.points.length -1).join(', ') }}</td>
                <td >{{ cargo.to }}</td>
                <td >{{ moment(cargo.finishDateTotal).format("DD.MM.YYYY") }}</td>
                <td >{{ moment(cargo.finishDateTotal).format("HH:mm") }}</td>
                <td class="nowrap">{{ cargo.price }} грн</td>
                <td >{{ cargo.vagons }}</td>
                <td >{{ cargo.distance }} км</td>
                <td class="nowrap">{{ moment.duration(cargo.minutesTotal, 'minutes').format('HHч mmм') }}</td>
              </tr>
            </template>
          </table>
          <div v-else-if="!loading.active && trains.length === 0">
            {{ t('message.no_data') }}
          </div>
          <div v-else class="d-flex justify-content-center mt-5">
            <div class="spinner-border" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
          </div>

        </div>

        <!-- Multiple trains -->

        <!-- !!! -->

        <div class="mt-5">

          <h5 class="mb-3 d-flex">
            <IconCSS name="ph:calculator" size="20" class="me-1"></IconCSS>
            {{ t('label.pay') }}
          </h5>

          <!-- <button @click="showCostTable" type="button" class="btn btn-lg btn-light d-flex align-items-center">
            <IconCSS v-if="!isCostTable" name="ph:plus" size="16"></IconCSS>
            <IconCSS v-else name="ph:minus" size="16"></IconCSS>
            <span class="ps-1">{{ t('label.pay') }}</span>
          </button> -->

          <div>
          
            <div class="row mt-3">
              <div class="col-sm-6">
                <label for="trains" class="form-label">{{ t('form.step') }}</label>
                <div class="d-flex">
                  <input v-model="settings.step" type="number" class="form-control" id="step" min="5" step="150">
                  <!-- <button @click="applySteps" type="button" class="btn btn-primary ms-3">{{ t('btn.apply') }}</button> -->
                  <button @click="calcMultipleHandler()" class="btn btn-primary ms-3 text-nowrap">{{ t('btn.calc_all') }}</button>
                  <button @click="calcMultipleHandler(30)" class="btn btn-primary ms-3 text-nowrap">{{ t('btn.calc_step') }}</button>
                </div>
              </div>
            </div>

            <div class="mt-5">
              <table v-if="Object.keys(trainsMultiple).length" class="custom-table large mt-3">
                <tr class="custom-table-header">
                  <th rowspan="2">{{ t('table.step') }}</th>
                  <th rowspan="2">{{ t('table.uid') }}</th>
                  <th rowspan="2">{{ t('table.stops') }}</th>
                  <th colspan="8">{{ t('table.way') }}</th>
                </tr>
                <tr>
                  <td v-for="i in 8" :key="i">{{ i }}</td>
                </tr>

                <template v-for="step in steps" :key="step">
                  <tr>
                    <td :rowspan="getTotalRows(trainsMultiple[step])">{{ step }}</td>
                    <template v-if="!trainsMultiple[step]">
                      <td colspan="10">
                        <div v-if="loadingMultiple.active && loadingMultiple.step === step" class="d-flex justify-content-center">
                          <div class="spinner-border" role="status">
                            <span class="visually-hidden">Loading...</span>
                          </div>
                        </div>
                        <button
                          v-else
                          @click="calcMultipleHandler(step)"
                          class="btn btn-secondary">{{ t('btn.calc_data') }}</button>
                      </td>
                    </template>
                  </tr>
                  <template v-if="trainsMultiple[step]">
                    <template v-for="(group, index) in trainsMultiple[step]" :key="index">
                      <tr>
                        <td :rowspan="Object.keys(group).length + 1">#{{ index }}</td>
                      </tr>
                      <!-- :class="{last: stopIndex === (Object.keys(group).length - 1)}" -->
                      <!-- :class="['stop-' + stopIndex, 'group-' + Object.keys(group).length]" -->
                      <tr clickable v-for="(stop, stopIndex) in group" :key="stopIndex" :class="{last: stopIndex == (Object.keys(group).length - 1)}">
                        <td>{{ stopIndex }}</td>
                        <td class="smaller" v-for="(train, index) in stop" :key="index">{{ train.price }}</td>
                        <template v-if="stop.length < 8">
                          <td v-for="empty in (8 - stop.length)" :key="empty">-</td>
                        </template>
                      </tr>
                    </template>
                  </template>
                </template>
              </table>
              <div v-else-if="loadingMultiple.active" class="d-flex justify-content-center">
                <div class="spinner-border" role="status">
                  <span class="visually-hidden">Loading...</span>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  </div>
</template>