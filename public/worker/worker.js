import _union from 'lodash.union/index.js'
// import moment from 'moment'
// import momentDurationFormatSetup from 'moment-duration-format'

// Results
// const trains = ref([])
// // Table of readiness (cargo)
// const readinessData = ref([])
// // Selected (clicked) readiness data row
// const selectedRows = ref([])

// const ways = ref([])
// const cargoGroups = ref([])
// // Meta data for cargo and trains
// const cargosMeta = ref({})

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

onmessage = (event) => {
  console.log("onmessage"+ event)
  postMessage(100600);
};

self.addEventListener('message', function(e) {
  console.log("In worker (public): received data: "+ e)
  self.postMessage(100500)
  // self.postMessage(sum)
}, false);

// const createTrains = (ways) => {
//     var start = performance.now();
//     // For each ways (ways filled by function filterWays)
//     for(let i = 0; i < ways.length; i++ ) {
//       console.log('progress', i)
      
//       const way = ways[i].way
//       const cargoList = ways[i].cargo
      
//       if(!cargoList || !cargoList.length || !way) {
//         continue
//       }
  
//       // For each cargos in this way
//       for(let j = 0; j < cargoList.length; j++ ) {
        
//         const cargoListCopy = cargoList.slice(0)
//         cargoListCopy.splice(j, 1)
  
//         // Use each cargo from the list as a base cargo (base path)
//         joinCargoGroups(cargoList[j], way, cargoListCopy)
//       }
//     }
  
//     var end = performance.now();
//     var time = end - start
//     console.log('Performance', time)

//     return cargoGroups.value
// }


// const findSimilarCargo = (list, cargo) => {
//   return list.find((item) => {
//     if(item.from === cargo.from && item.to === cargo.to && item.date === cargo.date) {
//       return item
//     }
//   })
// }

// const addCargoMeta = (cargo) => {
//   if(cargosMeta.value[cargo.uid] !== undefined){
//     cargosMeta.value[cargo.uid].trainsCount += 1
//   }else {
//     cargosMeta.value[cargo.uid] = {
//       train: true,
//       trainsCount: 1
//     }
//   }
// }

// const addCargo = (group, newCargo, way) => {

//   if(!findSimilarCargo(group.cargoList, newCargo)) {
//     group.uniques += 1
//   }

//   addCargoMeta(newCargo) 

//   const cargo = {
//     ...newCargo,
//     stops: 0,
//     stopPoints: []
//   }

//   for(let i = 0; i < group.cargoList.length; i++) {
//     const joinIndex = group.cargoList[i].points.indexOf(cargo.from)
//     if(joinIndex !== -1 && joinIndex !== group.cargoList[i].fromIndex && joinIndex !== group.cargoList[i].toIndex) {
//         group.cargoList[i].stops += 1
//         group.cargoList[i].stopPoints.push(cargo.from)
//     }
//   }

//   group.cargoList.push(cargo)
//   group.uids.push(cargo.uid)

//   if(cargo.fromIndex < group.fromIndex || group.fromIndex === null){
//     group.from = cargo.from
//     group.fromIndex = cargo.fromIndex
//     group.points = _union(cargo.points, group.points)
//   }

//   if(cargo.toIndex > group.toIndex || group.toIndex === null){
//     group.to = cargo.to
//     group.toIndex = cargo.toIndex
//     group.points = _union(group.points, cargo.points)
//   }

//   group.distance = way.dists.slice(group.fromIndex, group.toIndex).reduce((a,b) => {
//     return a + b
//   }, 0)

//   group.minutes = 60 * group.distance / setup.v

//   return group
// }

// const addCargoGroup = (newCargo) => {

//   addCargoMeta(newCargo)

//   const cargo = {
//     ...newCargo,
//     stops: 0,
//     stopPoints: []
//   }

//   const cargoGroup = {
//     cargoList:[cargo],
//     uids: [cargo.uid],
//     fromDate: cargo.date,
//     toDate: cargo.finishDate,
//     from: cargo.from,
//     to: cargo.to,
//     fromIndex: cargo.fromIndex,
//     toIndex: cargo.toIndex,
//     points: cargo.points,
//     distance: cargo.distance,
//     minutes: cargo.minutes,
//     uniques: 1
//   }

//   // cargoGroups.value.push(cargoGroup)
//   return cargoGroup
// }

// const joinCargoGroups = (baseCargo, way, cargoList) => {

//   // if(baseCargo.uid === 1)
//   //   console.log('1 - base', baseCargo)

//   // Set new cargo group
//   let newGroup = addCargoGroup(baseCargo)
//   // let newGroup = addCargoGroup(JSON.parse(JSON.stringify(baseCargo)))

//   for(let i = 0; i < cargoList.length; i++) {

//     // this cargo
//     const cargo = cargoList[i]

//     // 1) Skip prev path point cargo
//     if(newGroup.fromIndex > cargo.fromIndex)
//       continue

//     // 2) CHECK PURE TOTAL POTENTIAL DISTANCE
//     let potentialDistance = way.dists.slice(newGroup.fromIndex, cargo.toIndex).reduce((a,b) => {
//       return a + b
//     }, 0)

//     // Skip if new potential distance more then allowed
//     if(potentialDistance > setup.limits.distance){
//       continue
//     }

//     // 3) CHECK VAGONS AMOUNT LIMIT
//     let vagonsAmount = newGroup.cargoList.reduce((prev, curr) => {
//       if(curr.points.includes(cargo.from)) {
//         return prev + curr.vagons
//       }else {
//         return prev
//       }
//     }, 0)

//     // Skip if potential vagons amount more then allowed
//     if(vagonsAmount + cargo.vagons > setup.limits.vagons) {
//       continue
//     }


//     // 4) CHECK POSIBILITI CONNECTION BY ARRIVE TIME
//     // ...
//     const totalStopsToArrive = newGroup.cargoList.reduce((total, curr) => {
//       if(curr.from < cargo.from) {
//         return total + curr.stops
//       }else {
//         return total
//       }
//     }, 0)

//     const stopsMinutes = totalStopsToArrive * setup.limits.connectionMinutes


//     const distanceToArrive = way.dists.slice(newGroup.fromIndex, cargo.fromIndex).reduce((a,b) => {
//       return a + b
//     }, 0)
    
//     const minutesToArrive = 60 * distanceToArrive / setup.v

//     let arriveDateTime = moment(newGroup.fromDate).add(minutesToArrive + stopsMinutes, 'm')
//     let readyDateTime = moment(cargo.date)
//     let diff = arriveDateTime.diff(readyDateTime, 'm')

//     // console.log('newGroup', newGroup, 'cargo', cargo, distanceToArrive, minutesToArrive, diff)
//     if(diff < 0 || diff > setup.limits.delayMinutes ) {
//       continue
//     }

//     // ADD CONNECT / DISCONNECT spend time

//     // 5) CHECK GARGO SPEED
//     const stopLimits = newGroup.cargoList.find((item) => {
//       if(item.points.includes(cargo.from) && item.stops + 1  > item.speed){
//         return item
//       }
//     })

//     if(stopLimits !== undefined)
//       continue

//     // add cargo 
//     newGroup = addCargo(newGroup, cargo, way)
//   }

//   cargoGroups.value.push(newGroup)
      
// }