"use client";

import { useState } from "react";
import ChatButton from "app/components/ChatButton";
import TelegramChat from "app/components/TelegramChat";

export default function ChatProvider() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  const toggleChat = () => {
    setIsChatOpen((prev) => !prev);
    setHasUnread(false);
  };

  return (
    <>
      <ChatButton 
        onClick={toggleChat} 
        hasUnread={hasUnread} 
      />
      {isChatOpen && (
        <TelegramChat 
          isOpen={isChatOpen} 
          onClose={() => setIsChatOpen(false)}
          onNewMessage={() => setHasUnread(true)}
        />
      )}
    </>
  );
}
