import { Outlet, useMatch } from "react-router-dom";
import ChatSidebar from "../components/ChatSidebar";

export default function ChatLayout() {
  // On mobile, whether we're inside an open chat determines which pane shows.
  const isChatOpen = Boolean(useMatch("/chat/:chatId"));

  return (
    <div className={`chat-shell ${isChatOpen ? "chat-open" : ""}`}>
      <ChatSidebar />
      <div className="chat-main-slot">
        <Outlet />
      </div>
    </div>
  );
}
