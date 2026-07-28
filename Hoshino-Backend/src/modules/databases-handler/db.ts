import fs from "node:fs"
import path from "node:path"

const DB_DIR = path.resolve("./databases")
if (!fs.existsSync(DB_DIR)) {
	fs.mkdirSync(DB_DIR, { recursive: true })
}

const STORE_DIR = path.resolve("./store")
if (!fs.existsSync(STORE_DIR)) {
	fs.mkdirSync(STORE_DIR, { recursive: true })
}
