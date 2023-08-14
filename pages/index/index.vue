<script setup> 
import moment from 'moment'
import momentDurationFormatSetup from 'moment-duration-format'

import json_data_stations from '~/json/stations.json'
import json_data_ways from '~/json/ways.json'

const {t} = useI18n()

const stations = json_data_stations
const allWays = json_data_ways

const isLoading = ref(false)
const results = ref([])
const form = ref({
  from: 'A1',
  to: 'A2',
  vagons: 1,
  date: null,
  perPage: 20
})

const setup = {
  e: 16.165,
  v: 50
}

const sorting = ref({
  name: 'distance',
  dir: true,
  type: 'number'
})

momentDurationFormatSetup(moment)
// COMPUTED
const amount = computed(() => {
  return results.value.length
})

// Data
const tableData = computed(() => {
  const localResults = []

  for(let i = 0; i < results.value.length; i++){

    const travelTime = 60 * results.value[i].distance / setup.v;
    var arrivalTime = 0;
    var arrival = 0;

    if(form.value.date) {
      arrivalTime = moment(form.value.date).add(travelTime, 'minutes').format('DD.MM.YYYY, HH:mm')
      arrival = moment(form.value.date).add(travelTime, 'minutes')
    }

    const Eek1m = setup.e * results.value[i].distance
    const Ecap = 0.647446 * (2072 * form.value.vagons + Eek1m)
    const Ezag = Math.round((Ecap + 2072 * form.value.vagons + Eek1m) * 2)/2
    const Pnm = Math.round(1.1 * Ezag * 2)/2
    const Dnm = Math.round(((1.1 * Ezag) - Ezag) * 2)/2

    localResults.push({
      id: i + 1,
      Ezag: Ezag,
      Pnm: Pnm,
      Dnm: Dnm,
      //travelTime: moment.utc(moment.duration(travelTime, 'minutes').asMilliseconds()).format('HHч mmм'),
      travelTime: moment.duration(travelTime, 'minutes').format('HHч mmм'),
      travelMinutes: travelTime,
      arrivalTime: arrivalTime,
      arrival: arrival,
      distance: results.value[i].distance,
      points: results.value[i].points
    })
  }

  let sorted = null

  if(sorting.value.type === 'number')
    sorted = sortNumbers(localResults, sorting.value.dir, sorting.value.name)
  else if (sorting.value.type === 'date')
    sorted = sortDate(localResults, sorting.value.dir, sorting.value.name)

  return sorted.slice(0, form.value.perPage)
})

// METHODS

const sortDate = (list, dir, name) => {
  return list.sort((left, right) => {
    if(dir)
      return left[name].utc().diff(right[name].utc())
    else
      return right[name].utc().diff(left[name].utc())
  })
} 

const sortNumbers = (list, dir, name) => {
  return list.sort((a, b) => {
    if(dir)
      return a[name] - b[name]
    else
      return b[name] - a[name]
  })
} 

const getVariants = (from, finish, total = {points:[], distance: 0}, ways = []) => {
  return new Promise((resolve) => {

    if(!total.points.length) {
      total.points.push(from)
    }

    const availableWays = allWays.filter(way => {
      if(way.points.includes(from)) {
        const to = way.points.find(item => item !== from)
        return !total.points.includes(to)
      }else {
        return false
      }
    })

    if(!availableWays.length) {
      //console.log('no ways', from, total)
      return []
    }

    availableWays.forEach(way => {
      //const sum = {points: [], distance: 0}
      const newFrom = way.points.find(item => item !== from)
    
      const newTotal = {
        points: total.points.concat([newFrom]),
        distance: total.distance + way.dist
      }

      //console.log('newTotal',newTotal,)
      // total.points.push(newFrom)
      // total.distance += way.dist

      if(newFrom !== finish){
        //console.log(from + ' >>> ' + newFrom)
        const deeper = getVariants(newFrom, finish, newTotal, ways)
      }else {
        ways.push(newTotal)
        //console.log(from + ' >>> ' + newFrom + ' = FINISH', ways)
      }
    })

    resolve(ways);
  })
}

const sortHandler = (name, type = 'number') => {
  console.log('sortHandler', name,type)
  
  sorting.value.dir = !sorting.value.dir
  sorting.value.name = name
  sorting.value.type = type
}

const calculateHandler = async () => {
  isLoading.value = true
  await getVariants(form.value.from, form.value.to).then((data) => {
    let sorted = sortNumbers(data, true, 'distance')
    results.value = sorted.slice(0, form.value.perPage)
  }).finally(() => {
    isLoading.value = false
  })
}

</script>

<style src="./home.scss" lang="scss" scoped />
<i18n src="./messages.yaml" lang="yaml"></i18n>

<template>
  <div>
    <div class="container">
      <div class="row justify-content-center mt-5">
        
        <div class="col-md-2 col-sm-12">
          <h5 class="mb-3">{{ t('label.inputs') }}</h5>

          <form>
            <div class="mb-3">
              <label for="exampleInputEmail1" class="form-label">{{ t('form.start') }}</label>
              <select v-model="form.from" class="form-select" required>
                <option v-for="s in stations" :key="s.name" :value="s.name">{{ s.name }}</option>
              </select>
            </div>
            <div class="mb-3">
              <label for="exampleInputPassword1" class="form-label">{{ t('form.start') }}</label>
              <select v-model="form.to" class="form-select" required>
                <option v-for="s in stations" :key="s.name" :value="s.name">{{ s.name }}</option>
              </select>
            </div>
            <div class="mb-3">
              <label for="vagons" class="form-label">{{ t('form.vagons') }}</label>
              <input v-model="form.vagons" type="number" class="form-control" id="vagons" min="1" step="1" max="100" required>
            </div>
            <div class="mb-3">
              <label for="date" class="form-label">{{ t('form.date') }}</label>
              <input v-model="form.date" type="datetime-local" class="form-control" id="date" required>
            </div>
            <div class="mb-3">
              <label for="perPage" class="form-label">{{ t('form.perPage') }}</label>
              <input v-model="form.perPage" type="number" class="form-control" id="perPage" min="1" step="1" max="100">
            </div>

            <button @click="calculateHandler" type="button" class="btn btn-primary">{{ t('btn.calc') }}</button>

          </form>
        </div>

        <div class="col-md-10 col-sm-12">
          <h5 class="mb-3">{{ t('label.results') }}</h5>

          <table class="table table-sm">
            <caption>{{ t('table.ways_list') }}</caption>
            <thead>
              <tr>
                <th>
                  <div class="th-label">{{ t('table.way') }}</div>
                </th>
                <th>
                  <div class="th-label">{{ t('table.stations') }}</div>
                </th>
                <th>
                  <button-sort
                    :title="t('table.travelTime')"
                    :is-active="sorting.name === 'travelMinutes'"
                    :dir="sorting.dir"
                    @sort="sortHandler('travelMinutes')"
                  ></button-sort>
                </th>
                <th>
                  <button-sort
                    :title="t('table.arrivalTime')"
                    :is-active="sorting.name === 'arrival'"
                    :dir="sorting.dir"
                    @sort="sortHandler('arrival', 'date')"
                  ></button-sort>
                </th>
                <th>
                  <button-sort :title="t('table.Ezag')" :is-active="sorting.name === 'Ezag'" :dir="sorting.dir" @sort="sortHandler('Ezag')"></button-sort>
                </th>
                <th>
                  <button-sort :title="t('table.Pnm')" :is-active="sorting.name === 'Pnm'" :dir="sorting.dir" @sort="sortHandler('Pnm')"></button-sort>
                </th>
                <th>
                  <button-sort :title="t('table.Dnm')" :is-active="sorting.name === 'Dnm'" :dir="sorting.dir" @sort="sortHandler('Dnm')"></button-sort>
                </th>
                <th>
                  <button-sort :title="t('table.distance')" :is-active="sorting.name === 'distance'" :dir="sorting.dir" @sort="sortHandler('distance')"></button-sort>
                </th>
              </tr>
            </thead>
            <tbody v-if="!isLoading">
              <tr v-for="(way, key) in tableData" :key="way.id">
                <td>{{ '№' + way.id }}</td>
                <td>{{ way.points.join(', ') }}</td>
                <td>{{ way.travelTime }}</td>
                <td>{{ way.arrivalTime }}</td>
                <td>{{ $n(way.Ezag, 'currency') }}</td>
                <td>{{ $n(way.Pnm, 'currency') }}</td>
                <td>{{ $n(way.Dnm, 'currency') }}</td>
                <td>{{ $n(way.distance, 'distance') }}</td>
              </tr>
            </tbody>
            <tbody v-else>
              <tr>
                <td colspan="3">
                  <div class="d-flex justify-content-center">
                    <div class="spinner-grow text-secondary" role="status">
                      <span class="visually-hidden">Loading...</span>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <!-- <div>{{ results }}</div> -->
        </div>
      </div>
    </div>
  </div>
</template>