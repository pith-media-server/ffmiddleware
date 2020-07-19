import beamcoder from "beamcoder";
import * as process from "process";

async function go(input: string, output: string) {
    // const writeStream = fs.createWriteStream(output);
    // const spec = {start: 0, end: 10};

    const params = {
        video: [
            {
                sources: [
                    {
                        url: "file:" + input,
                        // ms: spec,
                        streamIndex: 0
                    }
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
            // {
            //     sources: [
            //         {
            //             url: "file:" + input,
            //             // ms: spec,
            //             streamIndex: 1
            //         }
            //     ],
            //     filterSpec: '[in0:a] aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo [out0:a]',
            //     streams: [
            //         {
            //             name: 'aac', time_base: [1, 48000], encoderName: 'aac',
            //             codecpar: {
            //                 sample_rate: 48000, format: 'fltp',
            //                 channels: 2, channel_layout: 'stereo'
            //             }
            //         }
            //     ]
            // },
        ],
        out: {
            formatName: 'mp4',
            // options: {
            //     movflags: 'empty_moov+frag_keyframe+faststart'
            // },
            // output_stream: writeStream,
            url: 'file:' + output
        }
    };

    await beamcoder.makeSources(params);
    let beamStreams = await beamcoder.makeStreams(params);
    await beamStreams.run();

}

go(process.argv[2], process.argv[3]);
