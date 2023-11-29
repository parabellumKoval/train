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

const settings = ref({
  step: 15,
  trains: 20,
  deep: 200
})

// Results
const tableSteps = ref(15)
const isCostTable = ref(false)
const trains = ref([])
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

const priceCalc = (cargo, group) => {
  let distsJoinsSum = 0
     
  for(let p = 0; p < cargo.dists.length; p++) {
    const point = cargo.points[p]
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
    if(a.uniques > b.uniques) {
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
  console.log('Performance', time)

  // Fill Empty values
  for (const [key, value] of Object.entries(uidsObject)) {
    if(value.count === 0) {
      console.log('0 variations', value)
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



// METHODS 
const findSimilarCargo = (list, cargo) => {
  return list.find((item) => {
    if(item.from === cargo.from && item.to === cargo.to && item.date === cargo.date) {
      return item
    }
  })
}

const filterWays = async (allWays) => {
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
        if(distance <= setup.limits.distance) {

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
  console.log('variationsForCargo', variationsForCargo)

  console.log('Performance', time)

  // Join cargo to train
  await useCargo().createTrains(ways.value).then((data) => {
    console.log('FROM COMSABLES', data)
    cargoGroups.value = data

    setTrains()
  })

  // createTrains()

  // console.log('cargosMeta', cargosMeta.value)
  // console.log('cargoGroups', cargoGroups.value, trains.value)
}

const getWays = async () => {

  const promise1 = await useWay().getVariants('A1', 'A25').then((data) => {
    return data
  })

  const promise2 = await useWay().getVariants('A25', 'A1').then((data) => {
    return data
  })

  Promise.all([promise1, promise2]).then((values) => {
    const allData = [...values[0], ...values[1]]
    
    // Longest ways first
    allData.sort((a, b) => {
      if(a.distance > b.distance)
        return -1
      else
        return 1
    })

    // Calc available trains
    filterWays(allData)
    // console.log('worker', worker)
  });

}

const calcHandler = async () => {

  loading.value.active = true

  setTimeout(() => {
    getWays()
  }, 100)
}

const getCargoGroup = (newCargo, readiness) => {

  const minutes = 60 * newCargo.distance / 50

  const cargo = {
    ...readiness, // uid, date, speed, vagons, from, to
    ...newCargo, //distance, points, dists
    finishDate: moment(readiness.date).add(minutes, 'm').format("YYYY-MM-DDTHH:mm"),
    finishDateTotal: moment(readiness.date).add(minutes, 'm').format("YYYY-MM-DDTHH:mm"),
    minutes: minutes,
    minutesTotal: minutes,
    stops: 0,
    stopPoints: []
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

const applySteps = () => {
  settings.value.step = tableSteps.value
}

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
              <th>Номер поїзду</th>
              <th>Філіал відправлення</th>
              <th colspan="2">Дата та час відправлення поїзда</th>
              <th>Філія причеплення</th>
              <th colspan="2">Дата та час відправлення поїзда зі станції відчеплення</th>
              <th>Проміжні філії</th>
              <th colspan="2">Філія призначення та філія призначення причепної філії</th>
              <th colspan="2">Дата та час прибуття поїзда на філію призначення \ причіпної групи</th>
              <th>Вартість проїзду</th>
              <th>Кількість вагонів основна група та причіпна група</th>
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
                <td class="smaller">{{ train.cargoList[0].points.slice(1, train.cargoList[0].points.length - 1).join(', ') }}</td>
                <td >{{ train.cargoList[0].to}}</td>
                <td >{{ '–' }}</td>
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
                <td >{{ moment(cargo.date).format("DD.MM.YYYY") }}</td>
                <td >{{ moment(cargo.date).format("HH:mm") }}</td>
                <td class="smaller">{{ cargo.points.slice(1, cargo.points.length -1).join(', ') }}</td>
                <td >{{ (cargo.from === train.from)? cargo.to: '–' }}</td>
                <td >{{ (cargo.from !== train.from)? cargo.to: '–' }}</td>
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

        <div v-if="!loading.active && trains.length > 0" class="mt-5">
          <button @click="showCostTable" type="button" class="btn btn-lg btn-light d-flex align-items-center">
            <IconCSS v-if="!isCostTable" name="ph:plus" size="16"></IconCSS>
            <IconCSS v-else name="ph:minus" size="16"></IconCSS>
            <span class="ps-1">{{ t('label.pay') }}</span>
          </button>

          <div v-if="isCostTable">
            <div class="row mt-3">
              <div class="col-sm-3">
                <label for="trains" class="form-label">{{ t('form.step') }}</label>
                <div class="d-flex">
                  <input v-model="tableSteps" type="number" class="form-control" id="step" min="5" step="150">
                  <button @click="applySteps" type="button" class="btn btn-primary ms-3">{{ t('btn.apply') }}</button>
                </div>
              </div>
            </div>

            <table v-if="!loading.active && trains.length > 0" class="custom-table large mt-3">
              <tr class="custom-table-header">
                <th>Номер поїзду</th>
                <th v-for="step in steps" :key="step">{{ step }}</th>
              </tr>
              <tr
                  v-for="(train, index) in trains"
                  :key="index"
                  :class="{last: train.cargoList.length - 2 === cargoIndex}"
                >
                  <td >{{ index + 1 }}</td>
                  <td v-for="step in steps" :key="step">-</td>
              </tr>
            </table>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>