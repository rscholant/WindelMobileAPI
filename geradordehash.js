const md5 = require('md5');

const salt = '>6zbzVHoGz2Xiq>>,i<S(1G=ik;eh[&hK(od(2Q-1l:_M3|%.Q#c89x{h;F`ZK4q';
let cnpj = '10436009000101';
let macaddress = 'DC:BF:E9:5B:D9:FD';

cnpj = cnpj
  .toLowerCase()
  .split(/[^0-9]/)
  .join('');

macaddress = macaddress
  .toLowerCase()
  .split(/[^a-zA-Z0-9]/)
  .join('');

console.info('CNPJ Hash:');
console.info(md5(cnpj + salt));

console.info('Device Hash:');
console.info(cnpj + macaddress + salt);
console.info(md5(cnpj + macaddress + salt));
