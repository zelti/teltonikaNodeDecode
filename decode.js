
/*
 setdigout ?1
00000000000000140C01050000000C7365746469676F7574203F310100007DB4

setdigout ?0
00000000000000140C01050000000C7365746469676F7574203F30010000EDB5
*/

/**
 * convert a ineteger 8 bits to 32
 * @param {integer} num 
 */
const convert8To32Bits = num => {
    const buf = Buffer.alloc(4)
    buf.writeInt32BE(num,0)
    return buf
}

/**
 * compute the diferrence between two dates
 * in seconds
 * @param {datetime} date 
 */
const dateDiff = (date) => (new Date() - new Date(date)) / 1000

const decoderList = new Object ({
    "bu1" : (pos, rawData) => rawData.readUInt8(pos),
    "bu2" : (pos, rawData) => rawData.readUInt16BE(pos),
    "bu4" : (pos, rawData) => rawData.readUInt32BE(pos),
    "bu8" : (pos, rawData) => parseInt(rawData.readBigUInt64BE(pos)),

    "bs1" : (pos, rawData) => rawData.readInt8(pos),
    "bs2" : (pos, rawData) => rawData.readInt16BE(pos),
    "bs4" : (pos, rawData) => rawData.readInt32BE(pos),
    "bs8" : (pos, rawData) => parseInt(rawData.readBigInt64BE(pos)),
})

/**
 * Transform unixtime to iso datetime
 * @param {inetger} unixtime 
 */
const unixToTimestamp = (unixtime) => {
    return new Date(unixtime).toISOString();
}

/**
 * sum distinct integers
 * @param  {...inetegers} value
 * @return {integer} of position of the piece of data needed
 */
const position = (...value) => value.reduce ((a, b) => a + b)

//use for longitude and latitude calculation
const presicion = 10000000.0;


module.exports = class Decode {
    
    constructor(redisClient, socket, apiURL = null){
        this.redisClient = redisClient
        this.socket = socket
        this.apiURL = apiURL
    }

    /**
     * Determine wich of the decoderList function
     * use to decode
     */
    bytesDecoder = (type, pos) => decoderList[type](pos, this.rawData_)

    /**
     * Get device imei
     * @param {hexadecimal} rawData 
     * @return {hexadecimal} ack
     */
    imei(rawData) {
        this.imei_ = rawData.toString("ascii",2,17)
        return Buffer.from('01', "hex")
    }

    /**
     * Determine is codec 8 and begin decode 
     * the AVL data
     * @param {hexadecimal} rawData 
     * @return {hexadecimal} ack
     */
    rawData(rawData){

        this.rawData_ = rawData
        
        const codec = rawData.readUInt8(8)
        const recordsNumber = rawData.readUInt8(9)

        const playload = codec === 8 
            ? this.avlDecode(recordsNumber)
            : this.anotherCodecDecode(codec, recordsNumber)

        console.log({
            "imei": this.imei_,
            "data": JSON.stringify(playload)
        })

        return convert8To32Bits(recordsNumber) 
    }

    /**
     * Decode anothers codec (for now codec 12)
     * @param {integer} codec 
     * @param {integer} recordsNumber 
     * @returns {string} hexadecimal string
     */
    anotherCodecDecode(codec, recordsNumber){
        this.redisClient.del("gps_"+this.imei_)
        return this.rawData_.toString("hex")
    }

    /**
     * Loop and decode the Avl data
     * @param {integer} recordsNumber 
     * @param {integer} init 
     * @param {Array} avlArray 
     * @return {Array} avl decoded array
     */
    avlDecode(recordsNumber, init = 10, avlArray = []){

        const ioEvents = this.solveIoBytesLen(position(init,26))

        avlArray.push({
            "datetime" : unixToTimestamp(
                this.bytesDecoder("bu8", position(init))
            ),
            "priority"   : this.bytesDecoder("bu1", position(init,8)),
            "longitude"  : this.bytesDecoder("bs4", position(init,9))/presicion,
            "latitude"   : this.bytesDecoder("bs4", position(init,13))/presicion,
            "altitude"   : this.bytesDecoder("bu2", position(init,17)),
            "angle"      : this.bytesDecoder("bu2", position(init,19)),
            "satellites" : this.bytesDecoder("bu1", position(init,21)),
            "speed"      : this.bytesDecoder("bu2", position(init,22)),
            "eventIoId"  : this.bytesDecoder("bu1", position(init,24)),
            "totalId"    : this.bytesDecoder("bu1", position(init,25)),
            "events"     : ioEvents.events,
        })

        return recordsNumber === 1
            ? avlArray
            : this.avlDecode(recordsNumber - 1, ioEvents.nextInit, avlArray)

    }

    /**
     * Determine the length of bytes need to 
     * decode the io events
     * @param {integer} init 
     * @param {integer} ioBytesLen 
     * @param {integer} eventsArray 
     * @return {object} with the next loop init & io events array
     */
    solveIoBytesLen(init, ioBytesLen = 1, eventsArray = []){
        
        const eventsCount = this.rawData_.readUInt8(init)

        const decodedEvents = eventsCount === 0
            ? {"eventsArray" : eventsArray, "nextInit" : position(init,1) }
            : this.eventsDecode( position(init,1), eventsCount, ioBytesLen, eventsArray)

        return ioBytesLen === 8
            ? {"events" : eventsArray, "nextInit" : decodedEvents.nextInit}
            : this.solveIoBytesLen(decodedEvents.nextInit, ioBytesLen * 2, eventsArray)
    }

    /**
     * Loop and decode io events
     * @param {integer} init 
     * @param {integer} eventCount 
     * @param {integer} ioBytesLen 
     * @param {Array} eventsArray 
     * @return {object} with next loop init & io events array to determined bytes length
     */
    eventsDecode(init, eventCount, ioBytesLen, eventsArray){
        
        eventsArray.push({
            "id"    : this.bytesDecoder("bu1", position(init)),
            "value" : this.bytesDecoder("bu"+ioBytesLen, position(init,1))
        })
    
        return eventCount === 1
            ? { "eventsArray" : eventsArray, "nextInit" : position(init, ioBytesLen, 1) }
            : this.eventsDecode(position(init, ioBytesLen, 1), eventCount - 1, ioBytesLen, eventsArray)
    }

    /**
     * Start check pending comand
     * valid is imei was set 
     */
    pendingCommand(){
        this.imei_ === undefined
            ?  null
            : this.checkRedis()
    }

    /**
     * get the command from redis
     * if no exist.. does nothing
     */
    checkRedis(){
        let self = this
        this.redisClient.get("gps_"+this.imei_, function(err, reply) {
            reply != null 
                ? self.checkCommandStatus(JSON.parse(reply)) 
                : null
        })
    }

    /**
     * Valid is the command was sent or 
     * if not has been sent in the last 10 second
     * to send again
     * @param {json} reply 
     */
    checkCommandStatus(reply){
        reply.hasSended === true && dateDiff(reply.datetime) > 10 || reply.hasSended === false
            ? this.sendCommand(reply)
            : null
    }

    /**
     * send the command to the device
     * and update the redis sended datetime 
     * in unixtime for later validation
     * @param {json} reply 
     */
    sendCommand(reply){
        this.socket.write( Buffer.from(reply.command, "hex") )
        this.redisClient.set("gps_"+this.imei_, JSON.stringify({
            hasSended : true,
            command   : reply.command,
            datetime  : Date.now()
        }))
    }


}