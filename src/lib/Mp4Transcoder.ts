import beamcoder, {
    DecodedFrames,
    Decoder,
    Demuxer,
    Encoder,
    Filterer, FiltererAudioOptions,
    Muxer,
    Packet,
    Stream
} from "beamcoder";

type TimeBase = [number, number];

function adjustTimeBase(packet: Packet, sourceTimeBase: TimeBase, targetTimeBase: TimeBase) {
    packet.pts = packet.pts * sourceTimeBase[0] * targetTimeBase[1] / sourceTimeBase[1] / targetTimeBase[0];
}

async function writeFrames(encodedFrames: { packets: Packet[] }, targetStream: Stream, muxer: Muxer) {
    for (let encodedPackets of encodedFrames.packets) {
        encodedPackets.stream_index = targetStream.index;
        console.log(encodedPackets.stream_index, encodedPackets.pts, encodedPackets.duration);
        await muxer.writeFrame(encodedPackets);
    }
}

async function createAudioFormatFilter(audioEncoder: Encoder, inputAudioStream: Stream) : Promise<Filterer> {
    let filterOptions = {
        filterType: 'audio',
        filterSpec: `aresample=${audioEncoder.sample_rate}, aformat=sample_fmts=${audioEncoder.sample_fmt}:channel_layouts=${audioEncoder.channel_layout}, asetnsamples=n=1024:p=1`,
        inputParams: [{
            timeBase: inputAudioStream.time_base,
            sampleFormat: inputAudioStream.codecpar.format,
            sampleRate: inputAudioStream.codecpar.sample_rate,
            channelLayout: inputAudioStream.codecpar.channel_layout
        }],
        outputParams: [{
            sampleFormat: audioEncoder.sample_fmt,
            sampleRate: audioEncoder.sample_rate,
            channelLayout: audioEncoder.channel_layout
        }]
    } as FiltererAudioOptions;
    const audioReformatter = await beamcoder.filterer(filterOptions);
    console.debug(audioReformatter.graph.dump());
    return audioReformatter;
}

async function recodeAndWrite(audioFilter: Filterer, decodedFrames: DecodedFrames, audioEncoder: Encoder, outputAudioStream: Stream, muxer: Muxer) {
    let reformattedFrames = await audioFilter.filter(decodedFrames.frames);
    for (let rff of reformattedFrames) {
        let encodedFrames = await audioEncoder.encode(rff.frames);
        await writeFrames(encodedFrames, outputAudioStream, muxer);
    }
}

export class Mp4Transcoder {
    private audioDecoder: Decoder;
    private muxer: Muxer;
    private audioEncoder: Encoder;

    private outputAudioStream: Stream;
    private outputVideoStream: Stream;
    private audioReformatter: Filterer;

    constructor(private input: Demuxer,
                private output: NodeJS.WritableStream,
                private videoStream: Stream,
                private audioStream: Stream) {
    }

    async init() {
        const mp4Format = beamcoder.muxers().mp4;
        const audioCodec = beamcoder.encoders()[mp4Format.audio_codec];

        this.audioDecoder = beamcoder.decoder({
            demuxer: this.input,
            stream_index: this.audioStream.index
        });

        const outputStream = beamcoder.muxerStream({
            highwaterMark: 65536
        });
        outputStream.pipe(this.output);

        this.muxer = await outputStream.muxer({
            format_name: mp4Format.name
        });

        this.outputVideoStream = this.muxer.newStream({
            ...this.videoStream,
            time_base: [1, 16000]
        });

        this.audioEncoder = beamcoder.encoder({
            codec_id: audioCodec.id,
            sample_rate: this.audioStream.codecpar.sample_rate,
            sample_fmt: audioCodec.sample_fmts[0],
            channels: this.audioStream.codecpar.channels,
            channel_layout: this.audioStream.codecpar.channel_layout,
            time_base: [1, this.audioStream.codecpar.sample_rate]
        });

        this.outputAudioStream = this.muxer.newStream({codecpar: {
                ...this.audioEncoder,
                format: this.audioEncoder.sample_fmt
            },
            channel_layout: this.audioEncoder.channel_layout,
            channels: this.audioEncoder.channels,
            time_base: this.audioEncoder.time_base,
            name: this.audioEncoder.name
        });

        this.audioReformatter = await createAudioFormatFilter(this.audioEncoder, this.audioStream);

        await this.muxer.openIO();

        await this.muxer.writeHeader({
            movflags: 'empty_moov+frag_keyframe+faststart'
        });
    }

    async write(packet: Packet) {
        if (packet.stream_index === this.videoStream.index) {
            adjustTimeBase(packet, this.videoStream.time_base as TimeBase, this.outputVideoStream.time_base as TimeBase);
            await writeFrames({packets: [packet]}, this.outputVideoStream, this.muxer);
        } else if (packet.stream_index === this.audioStream.index) {
            let decodedFrames = await this.audioDecoder.decode(packet);
            await recodeAndWrite(this.audioReformatter, decodedFrames, this.audioEncoder, this.outputAudioStream, this.muxer);
        }
    }

    async finish() {
        await recodeAndWrite(this.audioReformatter, await this.audioDecoder.flush(), this.audioEncoder, this.outputAudioStream, this.muxer);
        await writeFrames(await this.audioEncoder.flush(), this.outputAudioStream, this.muxer);
        await this.muxer.writeTrailer();
    }
}
