const nodeAbi = require('node-abi');

nodeAbi.getAbi('7.2.0', 'node');
// '51'
nodeAbi.getAbi('1.4.10', 'electron');
// '50'
nodeAbi.getTarget('51', 'node');
// '7.2.0'
nodeAbi.getTarget('50', 'electron');
// '1.4.15'

console.log(nodeAbi.allTargets);
