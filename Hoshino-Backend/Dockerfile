FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock* bunfig.toml* ./
RUN bun install --frozen-lockfile --production

COPY . .

EXPOSE 3000

CMD ["bun", "run", "index.ts"]