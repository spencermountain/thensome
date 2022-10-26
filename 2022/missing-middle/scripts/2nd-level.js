import data from './data.js'

// cluster by unit size
let obj = {}
data.forEach(o => {
  let size = null
  if (o.units === 1) {
    size = 'single'
  } else if (o.units <= 12) {
    size = 'middle'
  } else if (o.units > 12) {
    size = 'condo'
  }
  obj[size] = obj[size] || { total: 0, pending: 0, issued: 0 }
  obj[size].total += o.units
  if (o.issued) {
    obj[size].issued += o.units
  } else {
    obj[size].pending += o.units
  }
})
let all = Object.entries(obj).sort((a, b) => {
  if (a[1] > b[1]) {
    return -1
  } else if (a[1] < b[1]) {
    return 1
  }
  return 0
})
console.log(all)
