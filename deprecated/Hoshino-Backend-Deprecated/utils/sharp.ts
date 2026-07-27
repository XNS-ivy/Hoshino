import sharp from 'sharp'
import { writeExif } from './exif'

export type StickerOptions = {
    crop?: boolean
    fit?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside'
    quality?: number
    lossless?: boolean
    background?: { r: number; g: number; b: number; alpha: number }
    packname?: string
    publisher?: string
}

export async function makeSticker(
    buffer: Buffer,
    opt: StickerOptions = {}
): Promise<Buffer> {

    const creator = {
        packname: 'Hoshino',
        publisher: 'XNS-ivy',
    }

    const quality = opt.quality ?? 80
    const lossless = opt.lossless ?? false
    const fit = opt.fit ?? 'contain'
    const background = opt.background ?? { r: 0, g: 0, b: 0, alpha: 0 }
    const packname = opt.packname ?? creator.packname
    const publisher = opt.publisher ?? creator.publisher

    const image = sharp(buffer)
    const meta = await image.metadata()

    let pipeline = image

    if (opt.crop && meta.width && meta.height) {
        const size = Math.min(meta.width, meta.height)

        pipeline = pipeline.extract({
            left: Math.floor((meta.width - size) / 2),
            top: Math.floor((meta.height - size) / 2),
            width: size,
            height: size
        })
    }

    const webpBuffer = await pipeline
        .resize(512, 512, { fit, background })
        .webp({ quality, lossless })
        .toBuffer()

    if (packname || publisher) {
        return await writeExif(webpBuffer, packname, publisher)
    }

    return webpBuffer
}