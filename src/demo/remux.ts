import beamcoder, {Packet} from "beamcoder";
import * as process from "process";

async function go(input: string, output: string) {
    const mp4 = beamcoder.muxers().mp4;

    const demuxer = await beamcoder.demuxer(input);
    const inputVideoStream = demuxer.streams[0];
    const inputAudioStream = demuxer.streams[1];
    const muxer = await beamcoder.muxer({
        filename: 'file:' + output,
        format_name: mp4.name
    });

    const outputVideoStream = muxer.newStream(inputVideoStream);
    const outputAudioStream = muxer.newStream(inputAudioStream);

    await muxer.openIO();
    await muxer.writeHeader({
        movflags: 'empty_moov+frag_keyframe+faststart'
    });

    let packet: Packet;
    while (packet = await demuxer.read()) {
        console.log(packet.stream_index, packet.pts, packet.dts);
        await muxer.writeFrame(packet);
    }

    await muxer.writeTrailer();
}

go("file:" + process.argv[2], process.argv[3]);
