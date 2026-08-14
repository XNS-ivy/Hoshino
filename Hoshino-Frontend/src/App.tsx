import { BrowserRouter, Route, Routes } from "react-router-dom"
import { AgentDetailPage } from "./pages/AgentDetailPage"
import { AgentListPage } from "./pages/AgentListPage"
import { NotFoundPage } from "./pages/NotFoundPage"

export function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<AgentListPage />} />
				<Route path="/agents/:agentId" element={<AgentDetailPage />} />
				<Route path="*" element={<NotFoundPage />} />
			</Routes>
		</BrowserRouter>
	)
}
