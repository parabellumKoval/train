
import _union from 'lodash.union'
import moment from 'moment'
import momentDurationFormatSetup from 'moment-duration-format'

export const useCargo = () => {

  // Results
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
      // How long train can wain before arrive
      startDelayMinutes: 0,
      //
      connectionMinutes: 30,
      // How long cargo can wait
      delayMinutes: 2 * 60,
      // Max vagons connected to train
      vagons: 45,
      // 24 Hours max distance
      distance: 24 * 50,
      // 24 Hours max in minutes
      minutes: 24 * 60,
    }
  }

  const filterWays = (allWays: Array<Object>) => {
    return new Promise((resolve) => {
  
      resolve(true);
    })
  }

  const createTrains = (ways: Array<Object>, settings: Object) => {

    setSettings(settings)

    return new Promise((resolve) => {
      var start = performance.now();
      // For each ways (ways filled by function filterWays)
      for(let i = 0; i < ways.length; i++ ) {
        // console.log('progress', i)
        
        const way = ways[i].way
        const cargoList = ways[i].cargo
        
        if(!cargoList || !cargoList.length || !way) {
          continue
        }
    
        // For each cargos in this way
        for(let j = 0; j < cargoList.length; j++ ) {
          
          const cargoListCopy = cargoList.slice(0)
          cargoListCopy.splice(j, 1)
    
          // Use each cargo from the list as a base cargo (base path)
          joinCargoGroups(cargoList[j], way, cargoListCopy)
        }
      }
    
      var end = performance.now();
      var time = end - start
      // console.log('Performance', time)

      resolve(cargoGroups.value);
    })
  }


  const findSimilarCargo = (list, cargo) => {
    return list.find((item) => {
      if(item.from === cargo.from && item.to === cargo.to && item.date === cargo.date) {
        return item
      }
    })
  }

  const addCargoMeta = (cargo) => {
    if(cargosMeta.value[cargo.uid] !== undefined){
      cargosMeta.value[cargo.uid].trainsCount += 1
    }else {
      cargosMeta.value[cargo.uid] = {
        train: true,
        trainsCount: 1
      }
    }
  }

  const addCargo = (group, newCargo, way) => {

    if(!findSimilarCargo(group.cargoList, newCargo)) {
      group.uniques += 1
    }

    addCargoMeta(newCargo) 

    const cargo = {
      ...newCargo,
      stops: 0,
      stopPoints: [],
      minutesTotal: newCargo.minutes,
      // finishDateTotal: newCargo.finishDate,
      finishDateTotal: moment(newCargo.finishDate).add(newCargo.diff + setup.limits.connectionMinutes, 'm'),
      dateTotal: moment(newCargo.date).add(newCargo.diff + setup.limits.connectionMinutes, 'm'),
      dists: way.dists.slice(newCargo.fromIndex, newCargo.toIndex)
    }


    for(let i = 0; i < group.cargoList.length; i++) {

      // if new cargo isset on the another cargo way
      const joinIndex = group.cargoList[i].points.indexOf(cargo.from)

      if(joinIndex !== -1 && joinIndex !== 0 && joinIndex !== group.cargoList[i].fromIndex && joinIndex !== group.cargoList[i].toIndex) {

          // add stops
          group.cargoList[i].stops += 1
          group.cargoList[i].stopPoints.push({from: cargo.from, to: cargo.to})

          // Adding time to stops to finish time     
          const stopsMinutes = group.cargoList[i].stops * setup.limits.connectionMinutes
          group.cargoList[i].finishDateTotal = moment(group.cargoList[i].finishDate).add(stopsMinutes, 'm').format("YYYY-MM-DDTHH:mm")

          // Add minutes
          group.cargoList[i].minutesTotal = group.cargoList[i].minutes + stopsMinutes
      }
    }

    group.cargoList.push(cargo)
    group.uids.push(cargo.uid)

    // Points and dists
    if(cargo.fromIndex < group.fromIndex || group.fromIndex === null){
      group.from = cargo.from
      group.fromIndex = cargo.fromIndex
      group.points = _union(cargo.points, group.points)
    }

    if(cargo.toIndex > group.toIndex || group.toIndex === null){
      group.to = cargo.to
      group.toIndex = cargo.toIndex
      group.points = _union(group.points, cargo.points)
    }

    group.dists = way.dists.slice(group.fromIndex, group.toIndex)

    // Point Ditales
    let pointIndex = 1
    group.pointDitales = group.dists.map((dist) => {
      const point = group.points[pointIndex]

      const thisPointCargo = group.cargoList.filter((cargo) => {
        const findIndex = cargo.points.indexOf(point)
        return findIndex !== -1 && findIndex !== 0
      })

      pointIndex += 1

      return {
        point: point,
        dist: dist,
        count: thisPointCargo.length
      }
    })

    // Distance
    group.distance = way.dists.slice(group.fromIndex, group.toIndex).reduce((a,b) => {
      return a + b
    }, 0)

    // Minutes
    group.minutes = 60 * group.distance / setup.v

    return group
  }

  const addCargoGroup = (newCargo, way) => {

    addCargoMeta(newCargo)
  
    const cargo = {
      ...newCargo,
      stops: 0,
      stopPoints: [],
      minutesTotal: newCargo.minutes,
      finishDateTotal: newCargo.finishDate,
      dists: way.dists.slice(newCargo.fromIndex, newCargo.toIndex)
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
      dists: cargo.dists,
      distance: cargo.distance,
      minutes: cargo.minutes,
      uniques: 1
    }
  
    // cargoGroups.value.push(cargoGroup)
    return cargoGroup
  }

  const joinCargoGroups = (baseCargo, way, cargoList) => {

    // if(baseCargo.uid === 1)
    //   console.log('1 - base', baseCargo)
  
    // Set new cargo group
    let newGroup = addCargoGroup(baseCargo, way)
  
    for(let i = 0; i < cargoList.length; i++) {
  
      // this cargo
      const cargo = cargoList[i]
  
      // 1) Skip prev path point cargo
      if(newGroup.fromIndex > cargo.fromIndex)
        continue
  
      // 2) CHECK PURE TOTAL POTENTIAL DISTANCE
      // let potentialDistance = way.dists.slice(newGroup.fromIndex, cargo.toIndex).reduce((a,b) => {
      //   return a + b
      // }, 0)
  
      // Skip if new potential distance more then allowed
      // if(potentialDistance > setup.limits.distance){
      //   continue
      // }
  
      // 3) CHECK VAGONS AMOUNT LIMIT
      let vagonsAmount = newGroup.cargoList.reduce((prev, curr) => {
        if(curr.points.includes(cargo.from)) {
          return prev + curr.vagons
        }else {
          return prev
        }
      }, 0)
  
      // Skip if potential vagons amount more then allowed
      if(vagonsAmount + cargo.vagons > setup.limits.vagons) {
        continue
      }
  
  
      // 4) CHECK POSIBILITI CONNECTION BY ARRIVE TIME
      // ...
      const totalStopsToArrive = newGroup.cargoList.reduce((total, curr) => {
        if(curr.from < cargo.from) {
          return total + curr.stops
        }else {
          return total
        }
      }, 0)
  
      const stopsMinutes = totalStopsToArrive * setup.limits.connectionMinutes
  
      const distanceToArrive = way.dists.slice(newGroup.fromIndex, cargo.fromIndex).reduce((a,b) => {
        return a + b
      }, 0)
      
      const minutesToArrive = 60 * distanceToArrive / setup.v
  
      let arriveDateTime = moment(newGroup.fromDate).add(minutesToArrive + stopsMinutes, 'm')
      let readyDateTime = moment(cargo.date)

      // Разница между временем готовности груза и прибытием поезда на станцию, 
      // положительное значение - значит поезд запаздывает, не должно превышать допустимое время ожидания setup.limits.delayMinutes
      // отрецательное значение - значит поезд опережает график, то есть прибыл на станцию, но груз еще не готов 
      let diff = arriveDateTime.diff(readyDateTime, 'm')
      
      // Добавляется время, которое поезд может подождать на станции отправления
      // Если значение меньше нуля, значит поезд идет с опережением даже с учетом времени первоначального простоя на станции отправления
      let diffMax = diff + setup.limits.startDelayMinutes
  
      if((diff < 0 || diff > setup.limits.delayMinutes) && (diffMax < 0 || diffMax > setup.limits.delayMinutes)) {
        continue
      }
      // if(diff < 0 || diff > setup.limits.delayMinutes) {
      //   continue
      // }
  
      // ADD CONNECT / DISCONNECT spend time

      const totalStopsToArrive2 = newGroup.cargoList.reduce((total, curr) => {
        if(curr.from < cargo.from) {
          return total + curr.stops
        }else {
          return total
        }
      }, 1)
  
      const stopsMinutes2 = totalStopsToArrive2 * setup.limits.connectionMinutes

      let largestIndex = cargo.toIndex > newGroup.toIndex? cargo.toIndex: newGroup.toIndex
      let potentialDistance = way.dists.slice(newGroup.fromIndex, largestIndex).reduce((a,b) => {
        return a + b
      }, 0)
  
      const potentialMinutes = 60 * potentialDistance / setup.v
      const potentialMinutesFull = potentialMinutes + stopsMinutes2

      if(potentialMinutesFull > setup.limits.minutes)
        continue
  
      // 5) CHECK GARGO SPEED
      const stopLimits = newGroup.cargoList.find((item) => {
        const startIndex = item.points.indexOf(cargo.from)
        
        if(startIndex !== -1 && startIndex !== 0 && item.stops + 1  > item.speed){
          return item
        }
      })
  
      if(stopLimits !== undefined)
        continue
  
      // add cargo
      newGroup = addCargo(newGroup, {...cargo, diff: diff}, way)
    }
  
    cargoGroups.value.push(newGroup)
        
  }

  const setSettings = (value) => {
    const keys = Object.keys(value)
    const values = Object.values(value)

    for(let i = 0; i < keys.length; i++){
      const key = keys[i]
      const value = values[i]

      setup[key] = value
    }
  }

  return {
    filterWays,
    createTrains
  }
}