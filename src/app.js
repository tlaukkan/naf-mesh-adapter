const connect = require('connect');
const serveStatic = require('serve-static');
connect().use(serveStatic('./dist')).listen(8081, function(){
    console.log('Server running on 8081...');
});