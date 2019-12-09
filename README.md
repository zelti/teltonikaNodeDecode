# teltonikaNodeDecode
This is a teltonika FMXY device tcp server and data decoder

## Install

Clone this project and run:

    npm install

Update conf.json file to desired listen port 

    {
        "port":6850
    }

## Run

    npm index.js

## Send device commands

this command is sended throw redis, so you need to put a key with this format `gps_{imei}`

### Example:
    gps_867060032291151

the value has to follow a stric json format too

    {
        "hasSended": false,
        "datetime": 1575663460077,
        "command": "00000000000000140C01050000000C7365746469676F7574203F310100007DB4"
    }

- `hasSendsed` is a Boolean always set it in false.
- `datetime` is in unix time format but in microseconds.
- `command` is a [teltonika codec 12](https://wiki.teltonika.lt/view/Codec#Codec_12) in hexadecimal string. 





