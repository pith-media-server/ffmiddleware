import beamcoder, {decoder, encoder, muxerStream, Packet} from "beamcoder";
import * as process from "process";
import * as fs from "fs";

async function go(input: string, output: string) {
    const writeStream = fs.createWriteStream(output);
    const spec = {start: 0, end: 10};

    const params = {
        video: [
            {
                sources: [
                    {url: input, ms: spec, streamIndex: 0}
                ],
                filterSpec: '[in0:v] scale=1280:720, colorspace=all=bt709 [out0:v]',
                streams: [
                    {
                        name: 'h264', time_base: [1, 90000], encoderName: 'libx264',
                        codecpar: {
                            width: 1280, height: 720, format: 'yuv422p', color_space: 'bt709',
                            sample_aspect_ratio: [1, 1]
                        }
                    }
                ]
            }
        ],
        audio: [
            {
                sources: [
                    {url: input, ms: spec, streamIndex: 2}
                ],
                filterSpec: '[in0:a] aformat=sample_fmts=fltp:channel_layouts=mono [out0:a]',
                streams: [
                    {
                        name: 'aac', time_base: [1, 90000], encoderName: 'aac',
                        codecpar: {
                            sample_rate: 48000, format: 'fltp', frame_size: 1024,
                            channels: 1, channel_layout: 'mono'
                        }
                    }
                ]
            },
        ],
        out: {
            formatName: 'mp4',
            options: {
                movflags: 'empty_moov+frag_keyframe+faststart'
            },
            output_stream: writeStream
        }
    };

    await beamcoder.makeSources(params);
    let beamStreams = await beamcoder.makeStreams(params);
    await beamStreams.run();

}

go("file:" + process.argv[2], process.argv[3]);
