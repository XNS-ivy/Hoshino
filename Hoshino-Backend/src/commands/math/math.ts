import type { CommandContext, ICommand } from "@customTypes/command"

const command: ICommand = {
	name: ["math", "calc"],
	category: "math",
	description: "Evaluate a mathematical expression safely",
	usage: ["math (50 * 2) / 4", "calc 12 * 12"],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		const expr = args.join(" ").trim()
		if (!expr) {
			await ctx.reply(
				`❌ Provide a mathematical expression!\nExample: *${ctx.prefix}math (50 * 2) / 4*`,
			)
			return
		}

		// Security: Whitelist safe mathematical characters only
		const safeExpr = expr.replace(/[^0-9+\-*/().^%\s]/g, "")
		if (!safeExpr) {
			await ctx.reply("❌ Invalid mathematical expression.")
			return
		}

		try {
			// Evaluate expression safely
			const fn = new Function(`return (${safeExpr})`)
			const result = fn()
			if (typeof result !== "number" || Number.isNaN(result)) {
				throw new Error("Invalid calculation result")
			}
			await ctx.reply(
				`🧮 *Math Expression:* \`${safeExpr}\`\n💡 *Result:* *${result}*`,
			)
		} catch (error) {
			await ctx.reply(`❌ Failed to calculate: ${error}`)
		}
	},
}

export default command
