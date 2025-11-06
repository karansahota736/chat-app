import React, { useEffect, useRef } from "react";

export default function ChatMessages({ messages, handleSend }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-2 bg-gray-100">
     {messages.map((msg, idx) => (
  <div key={idx} className={`flex w-full my-2 ${msg.fromMe ? "justify-end" : "justify-start"}`}>
    <div className={`break-words max-w-[70%] px-4 py-2 rounded-xl shadow ${msg.fromMe ? "bg-blue-500 text-white" : "bg-white text-gray-800"}`}>
      {msg.type === "image" && (
        <img src={msg.media_url} alt="media" className="rounded-md max-h-64 mb-1" />
      )}
      {msg.type === "video" && (
        <video controls className="rounded-md max-h-64 mb-1">
          <source src={msg.media_url} type="video/mp4" />
        </video>
      )}
      {msg.text && <div>{msg.text}</div>}
      <div className="text-[10px] text-right mt-1 opacity-70">{msg.time}</div>

       {msg.type === "button" && (
      <div>
        {msg.subtype === "call" && (
          <a
            href={`tel:${msg.phoneNumber}`}
            className="inline-block px-4 py-2 bg-green-500 text-white rounded"
          >
            {msg.text}
          </a>
        )}
        {msg.subtype === "url" && (
          <a
            href={msg.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-4 py-2 bg-blue-500 text-white rounded"
          >
            {msg.text}
          </a>
        )}
        {msg.subtype === "reply" && (
          <button
            onClick={() => handleSend(msg.text)}
            className="inline-block px-4 py-2 bg-purple-500 text-white rounded"
          >
            {msg.text}
          </button>
        )}
      </div>
    )}

    </div>
  </div>
))}

      <div ref={bottomRef} />
    </div>
  );
}


