import {Decoder, decoder, Demuxer, demuxer, encoder, Frame, Muxer, muxer, muxerStream, Packet, Stream} from "beamcoder";
import path from "path";

export class VideoSource {
    private readonly openPromise: Promise<void>;
    private demuxer?: Demuxer;
    private videoStream: Stream;
    private audioStream: Stream;

    constructor(path: string) {
        this.openPromise = this.open(path);
    }

    async open(path?: string): Promise<void> {
        if (this.openPromise) {
            return this.openPromise;
        }
        if (path) {
            this.demuxer = await demuxer(path);
            this.videoStream = this.demuxer.streams.find(s => s.codecpar.codec_type === 'video');
            this.audioStream = this.demuxer.streams.find(s => s.codecpar.codec_type === 'audio');
        }
    }

    async getFrame(time: number): Promise<{ type: string, body: BufferSource }> {
        await this.open();
        await this.demuxer.seek({time});
        let packet;
        do {
            packet = await this.demuxer.read();
        } while (packet && packet.stream_index !== this.videoStream.index)

        if (!packet) {
            throw Error("Frame not found");
        }

        const videoDecoder = decoder({demuxer: this.demuxer, stream_index: this.videoStream.index});
        let decodedFrames = await videoDecoder.decode(packet);
        if (!decodedFrames.frames.length) {
            decodedFrames = await videoDecoder.flush();
        }
        let enc = encoder({
            name: 'mjpeg',
            width: videoDecoder.width,
            height: videoDecoder.height,
            pix_fmt: videoDecoder.pix_fmt.indexOf('422') >= 0 ? 'yuvj422p' : 'yuvj420p',
            time_base: [1, 1]
        });
        let jpegResult = await enc.encode(decodedFrames.frames[0]); // Encode the frame
        await enc.flush(); // Tidy the encoder
        return {
            type: 'image/jpeg',
            body: jpegResult.packets[0].data
        }
    }

    async* keyframes(): AsyncGenerator<{ pos: number, duration: number, pts: number, dts: number }> {
        let frame: Packet;
        await this.demuxer.seek({time: 0});
        while (frame = await this.demuxer.read()) {
            if (frame.stream_index === this.videoStream.index) {
                if (frame.flags.KEY) {
                    yield {pos: frame.pos, duration: frame.duration, pts: frame.pts, dts: frame.dts};
                }
            }
        }
    }

    async createApplePlaylist(basename: string): Promise<{ type: string, body: string }> {
        await this.open();
        await this.demuxer.seek({pos: 0});

        const timeBase = this.videoStream.time_base;
        const chunkSize = 10 * timeBase[1] / timeBase[0];

        let playlist = '#EXTM3U\n';
        playlist += '#EXT-X-PLAYLIST-TYPE:VOD\n';
        playlist += '#EXT-X-VERSION:3\n';
        playlist += '#EXT-X-MEDIA-SEQUENCE:0\n';
        playlist += '#EXT-X-ALLOW-CACHE:NO\n';
        playlist += `#EXT-X-TARGETDURATION:${(chunkSize / timeBase[1] * timeBase[0]) + 1}\n`;

        let previousFrame = {pts:0}
        for await(let keyframe of this.keyframes()) {
            if(!previousFrame) {
                previousFrame = keyframe;
            } else if (previousFrame.pts + chunkSize < keyframe.pts) {
                playlist += `#EXTINF:${((keyframe.pts - previousFrame.pts) / timeBase[1] * timeBase[0]).toFixed(6)},\n` +
                    `${basename.substr(0, basename.indexOf('?'))}?action=transcode&startTs=${previousFrame ? previousFrame.pts : 0}&endTs=${keyframe.pts}&profile=apple\n`

                previousFrame = keyframe
            }
        }

        playlist += '#EXT-X-ENDLIST\n'

        return {
            type: 'application/x-mpegurl',
            body: playlist
        }
    }

    async transcode(out: NodeJS.WritableStream, {startPos, endPos, startTs, endTs, profile}: { startPos?: number, endPos?: number, startTs?: number, endTs?: number, profile: 'apple' }): Promise<void> {
        await this.open();

        if (startTs !== undefined) {
            console.debug("Seeking to startTs", startTs);
            await this.demuxer.seek({timestamp: startTs, stream_index: this.videoStream.index});
        } else if (startPos !== undefined) {
            await this.demuxer.seek({pos: startPos});
        } else {
            await this.demuxer.seek({time: 0});
        }

        const stream = muxerStream({highwaterMark: 64 * 1024});
        stream.pipe(out);

        const mp4Muxer = stream.muxer({format_name: 'mp4'});
        const videoStream = mp4Muxer.newStream(this.videoStream);
        const audioStream = mp4Muxer.newStream(this.audioStream);

        await mp4Muxer.openIO({flags: {DIRECT: true, NONBLOCK: true, READ: false, WRITE: true}});
        await mp4Muxer.writeHeader({
            movflags: 'empty_moov+frag_keyframe+faststart',
            fflags: 'flush_packets'
        });

        let packet: Packet;
        let firstPts: number = 0;
        if(startTs !== undefined) {
            firstPts = startTs;
        }
        while ((packet = await this.demuxer.read()) && (endPos === undefined || packet.pos <= endPos) && (endTs === undefined || packet.pts <= endTs)) {
            await this.copyFrame(packet, firstPts, mp4Muxer, this.videoStream.index, videoStream.index);
            await this.copyFrame(packet, firstPts, mp4Muxer, this.audioStream.index, audioStream.index);
        }

        await mp4Muxer.writeTrailer();
    }

    private async copyFrame(packet: Packet, firstPts: number, mp4Muxer: Muxer, sourceStreamIndex: number, targetStreamIndex: number) {
        if (packet.stream_index === sourceStreamIndex) {
            console.log("packet", packet.dts, packet.pts, packet.flags);
            packet.pts -= firstPts;
            if (packet.dts) {
                packet.dts -= firstPts;
            }
            packet.stream_index = targetStreamIndex;
            console.log("adjusted packet", packet.dts, packet.pts);
            if(packet.pts > 0)
            await mp4Muxer.writeFrame(packet);
        }
    }
}
