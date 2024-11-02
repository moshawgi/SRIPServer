const lookup = require('country-code-lookup')

let countryCode = lookup.countries

let countries = []

for (let i = 0; i < countryCode.length; i++) {
    let country = countryCode[i]
    countries.push(country.country)
}

console.log(JSON.stringify(countries))