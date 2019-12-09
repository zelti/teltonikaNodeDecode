const decodeClass = require('./decode')
const net = require('net')
const redis = require('redis')
const conf = require('./conf.json')

const server = net.createServer(function(socket) {
    console.log('client connected')
    
    const decode = new decodeClass(redis.createClient(), socket)

    socket.on('end', function() {
        console.log('client disconnected')
        //Si cliente se deconecta 
        decode.redisClient.quit()
    })

    socket.on('data', function(data){

        socket.write( data.byteLength === 17 ? decode.imei(data) : decode.rawData(data) )
        decode.pendingCommand()
    });
    socket.on('drain', data =>{
        console.log('Vacio', data)
    })
});

server.listen(conf.port);
console.log('Listening on port:', conf.port)