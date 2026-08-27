import type { CommandContext, ICommand } from "@customTypes/command"
import { evaluate, round } from "mathjs"

const MATH_OPERATIONS: Record<string, string> = {
	// Arithmetic
	"+": "Addition (e.g. math 1 + 2)",
	"-": "Subtraction (e.g. math 10 - 5)",
	"*": "Multiplication (e.g. math 3 * 4)",
	x: "Multiplication alias (e.g. math 3 x 4)",
	"/": "Division (e.g. math 10 / 2)",
	div: "Division alias (e.g. math 10 div 2)",
	"%": "Modulo (e.g. math 10 % 3)",
	mod: "Modulo alias (e.g. math 10 mod 3)",
	// Power & Root
	"^": "Exponentiation (e.g. math 2^10)",
	"sqrt()": "Square root (e.g. math sqrt(144))",
	"akar()": "Square root alias (e.g. math akar(144))",
	"cbrt()": "Cube root (e.g. math cbrt(27))",
	"nthRoot()": "Nth root (e.g. math nthRoot(32, 5))",
	// Trigonometry
	"sin()": "Sine (e.g. math sin(45 deg))",
	"cos()": "Cosine (e.g. math cos(90 deg))",
	"tan()": "Tangent (e.g. math tan(30 deg))",
	"asin()": "Arc sine (e.g. math asin(1))",
	"acos()": "Arc cosine (e.g. math acos(0))",
	"atan()": "Arc tangent (e.g. math atan(1))",
	// Logarithm
	"log()": "Logarithm base 10 (e.g. math log(100))",
	"log2()": "Logarithm base 2 (e.g. math log2(8))",
	"log10()": "Logarithm base 10 (e.g. math log10(1000))",
	// Rounding
	"ceil()": "Round up (e.g. math ceil(4.3))",
	"floor()": "Round down (e.g. math floor(4.9))",
	"round()": "Round to decimal (e.g. math round(4.567, 2))",
	"fix()": "Truncate decimal (e.g. math fix(4.9))",
	// Others
	"!": "Factorial (e.g. math 10!)",
	"abs()": "Absolute value (e.g. math abs(-99))",
	"gcd()": "Greatest common divisor (e.g. math gcd(12, 8))",
	"lcm()": "Least common multiple (e.g. math lcm(4, 6))",
	"max()": "Maximum value (e.g. math max(1, 2, 3))",
	"min()": "Minimum value (e.g. math min(1, 2, 3))",
	"mean()": "Average value (e.g. math mean(1, 2, 3))",
	// Constants
	pi: "Pi constant π (3.14159...)",
	e: "Euler number (2.71828...)",
}

const command: ICommand = {
	name: ["math", "calc", "mathjs"],
	category: "math",
	description: "Evaluate a mathematical expression using mathjs",
	usage: ["math <expression>", "math help", "calc 12 * 12"],
	textOnly: true,
	execute: async (args: string[], ctx: CommandContext) => {
		if (!args[0]) {
			await ctx.reply(
				`❌ Please provide a math expression.\n\nType *${ctx.prefix}${ctx.commandName} help* to see all available operations.`,
			)
			return
		}

		if (args[0].toLowerCase() === "help") {
			const lines = Object.entries(MATH_OPERATIONS).map(
				([op, desc]) => `• \`${op}\` — ${desc}`,
			)

			await ctx.reply(`🧮 *Math Operations*\n\n${lines.join("\n")}`)
			return
		}

		try {
			const expression = args
				.join(" ")
				.replace(/\bx\b/gi, "*")
				.replace(/\bdiv\b/gi, "/")
				.replace(/\bmod\b/gi, "%")
				.replace(/\bakar\b/gi, "sqrt")
				.replace(/\bfaktorial\b/gi, "!")

			const result = evaluate(expression)

			if (
				result === undefined ||
				result === null ||
				typeof result === "function"
			) {
				throw new Error("Invalid calculation result")
			}

			const formatted =
				typeof result === "number"
					? Number.isInteger(result)
						? result.toString()
						: round(result, 10).toString()
					: String(result)

			await ctx.reply(
				`🧮 *Math Result*\n\n📝 Expression: ${expression}\n✅ Result: *${formatted}*`,
			)
		} catch {
			await ctx.reply(
				`❌ Invalid expression.\n\nType *${ctx.prefix}${ctx.commandName} help* to see all available operations.`,
			)
		}
	},
}

export default command
