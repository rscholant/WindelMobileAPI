let dirPath = '';
const fs = require('fs');
const path = require('path');

function writeToLog(log) {
  if (dirPath === '') {
    dirPath = path.dirname(process.execPath);
  }
  fs.appendFileSync(
    `${dirPath}/Servidor.log`,
    `${new Date().toISOString()}: ${log}\n`
  );
}

module.exports = {
  setDirPath: (newPath) => {
    dirPath = newPath;
  },
  writeToLog,
};
