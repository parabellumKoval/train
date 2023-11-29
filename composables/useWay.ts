import json_data_ways from '~/json/ways.json'

export const useWay = () => {

  const allWays = json_data_ways

  const getVariants = (from: string, finish: string, total = {points:[], dists:[], distance: 0}, ways = []) => {
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
        return []
      }
  
      availableWays.forEach(way => {
        const newFrom = way.points.find(item => item !== from)
      
        const newTotal = {
          points: total.points.concat([newFrom]),
          dists: total.dists.concat([way.dist]),
          distance: total.distance + way.dist
        }
  
        if(newFrom !== finish){
          getVariants(newFrom, finish, newTotal, ways)
        }else {
          ways.push(newTotal)
        }
      })
  
      resolve(ways);
    })
  }

  return {
    getVariants
  }
}