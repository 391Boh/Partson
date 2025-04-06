"use client";

import { useState } from "react";
import ChatButton from "./ChatButton";
import TelegramChat from "./TelegramChat";

export default function ChatContainer() {
  const [isChatOpen, setIsChatOpen] = useState(false);

  const handleOpenChat = () => {
    setIsChatOpen(true);
  };

  const handleCloseChat = () => {
    setIsChatOpen(false);
  };

  return (
    <>
      {isChatOpen ? (
        <TelegramChat isOpen={isChatOpen} onClose={handleCloseChat} />
      ) : (
        <ChatButton onClick={handleOpenChat} hasUnread={false} />
      )}
    </>
  );
}
