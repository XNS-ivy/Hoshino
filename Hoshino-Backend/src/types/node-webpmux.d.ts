declare module "node-webpmux" {
	class Image {
		width: number
		height: number
		exif: Buffer | null

		load(data: Buffer | string): Promise<void>
		save(path: string | null): Promise<Buffer>
		demux(path: string, options?: { frame?: number }): Promise<void>
		replaceFrame(index: number, path: string): Promise<void>

		static generateFrame(options: { path?: string; buffer?: Buffer }): unknown
	}

	const TYPE_LOSSY: number
	const TYPE_LOSSLESS: number
	const TYPE_EXTENDED: number

	export { Image, TYPE_EXTENDED, TYPE_LOSSLESS, TYPE_LOSSY }
}
