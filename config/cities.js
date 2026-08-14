// The single list of places a listing can sit in. It used to be repeated inline
// in four templates, which is why adding a region meant finding all four.
//
// `region` drives nothing but grouping in the dropdowns today; it exists so the
// southern districts can be introduced without pretending they are the same
// market as the north.

const CITIES = [
  { name: 'Lefkoşa', region: 'north' },
  { name: 'Girne', region: 'north' },
  { name: 'Gazimağusa', region: 'north' },
  { name: 'İskele', region: 'north' },
  { name: 'Güzelyurt', region: 'north' },
  { name: 'Larnaka', region: 'south' },
  { name: 'Limasol', region: 'south' },
  { name: 'Baf', region: 'south' },
  { name: 'Larnaka Kırsal', region: 'south' }
];

const names = () => CITIES.map((city) => city.name);

const byRegion = (region) => CITIES.filter((city) => city.region === region).map((city) => city.name);

const isKnown = (name) => names().includes(name);

const grouped = () => [
  { region: 'north', cities: byRegion('north') },
  { region: 'south', cities: byRegion('south') }
];

module.exports = {
  CITIES,
  names,
  byRegion,
  isKnown,
  grouped
};
