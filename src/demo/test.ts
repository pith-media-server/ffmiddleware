import beamcoder, {muxerStream, Packet} from "beamcoder";
import * as process from "process";
import * as fs from "fs";

async function go(input:string, output:string) {
    const demuxer = await beamcoder.demuxer(input);
    const stream = muxerStream({highwaterMark: 64*1024});
    await demuxer.seek({time: 0});
    let packet : Packet;
    while(packet = await demuxer.read()) {
        if(packet.stream_index===0)
        console.log(packet.dts, packet.pts, packet.duration, packet.stream_index, packet.flags.KEY);
    }
}

go("file:" + process.argv[2], process.argv[3]);
