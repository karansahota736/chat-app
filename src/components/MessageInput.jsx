import React, { useState, useRef } from "react";

export default function MessageInput({ onSend, onMediaSend }) {
  const [text, setText] = useState("");
  const fileInputRef = useRef();
  const [previewFiles, setPreviewFiles] = useState([]);
  // captions is an array of strings, one per file
  const [captions, setCaptions] = useState([]);
  const [showPreview, setShowPreview] = useState(false);

  const [showButtonForm, setShowButtonForm] = useState(false);
const [buttonType, setButtonType] = useState("");
const [buttonText, setButtonText] = useState("");
const [buttonPhone, setButtonPhone] = useState("");
const [buttonUrl, setButtonUrl] = useState("");


  const handleSubmit = (e) => {
    e.preventDefault();
    if (text.trim()) {
      onSend(text);
      setText("");
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setPreviewFiles(files);
    // Initialize captions array with empty strings
    setCaptions(Array(files.length).fill(""));
    setShowPreview(true);
  };

  // Update caption for specific media index
  const handleCaptionChange = (index, value) => {
    setCaptions((prev) => {
      const newCaptions = [...prev];
      newCaptions[index] = value;
      return newCaptions;
    });
  };

  const handleUpload = async () => {
    for (let i = 0; i < previewFiles.length; i++) {
      const file = previewFiles[i];
      const formData = new FormData();
      formData.append("media", file);
      formData.append("type", file.type.startsWith("video") ? "video" : "image");

      try {
       const res = await fetch(
  `${process.env.REACT_APP_API_URL}/api/upload`,
  {
    method: "POST",
    body: formData,
  }
);


        const data = await res.json();
        if (data.success && data.fileUrl) {
          onMediaSend({
            type: file.type.startsWith("video") ? "video" : "image",
            mediaUrl: data.fileUrl,
            text: captions[i], // use caption for this specific file
          });
        }
      } catch (err) {
        console.error("Upload failed", err);
      }
    }

    // Reset
    setPreviewFiles([]);
    setCaptions([]);
    setShowPreview(false);
  };

  return (
    <>

    {showButtonForm && (
  <div className="p-3 border rounded mt-2 bg-gray-50">
    <label className="block mb-2 font-medium">Button Type</label>
    <select
      value={buttonType}
      onChange={(e) => setButtonType(e.target.value)}
      className="w-full mb-2 border p-2 rounded"
    >
      <option value="">-- Select Type --</option>
      <option value="call">Call</option>
      <option value="url">URL</option>
      <option value="reply">Reply</option>
    </select>

    <input
      type="text"
      placeholder="Button Label"
      value={buttonText}
      onChange={(e) => setButtonText(e.target.value)}
      className="w-full mb-2 border p-2 rounded"
    />

    {buttonType === "call" && (
      <input
        type="tel"
        placeholder="Phone Number"
        value={buttonPhone}
        onChange={(e) => setButtonPhone(e.target.value)}
        className="w-full mb-2 border p-2 rounded"
      />
    )}

    {buttonType === "url" && (
      <input
        type="url"
        placeholder="URL"
        value={buttonUrl}
        onChange={(e) => setButtonUrl(e.target.value)}
        className="w-full mb-2 border p-2 rounded"
      />
    )}

    <button
      onClick={() => {
        if (!buttonText || !buttonType) return alert("All fields required");

        const message = {
          type: "button",
          subtype: buttonType,
          text: buttonText,
        };

        if (buttonType === "call") message.phoneNumber = buttonPhone;
        if (buttonType === "url") message.url = buttonUrl;

        onSend(message);

        // Reset
        setShowButtonForm(false);
        setButtonType("");
        setButtonText("");
        setButtonPhone("");
        setButtonUrl("");
      }}
      className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
    >
      Send Button Message
    </button>
  </div>
)}

<button
  type="button"
  onClick={() => setShowButtonForm((prev) => !prev)}
  className="text-sm px-3 py-2 bg-gray-200 rounded hover:bg-gray-300"
>
  {showButtonForm ? "Cancel Button Msg" : "➕ Button Message"}
</button>



      {/* Main Input UI */}
      <form onSubmit={handleSubmit} className="flex gap-2 items-center p-2 border-t bg-white">
        <button
          type="button"
          onClick={() => fileInputRef.current.click()}
          className="text-gray-600 hover:text-blue-600 text-2xl"
        >
          📎
        </button>
        <input
          type="file"
          ref={fileInputRef}
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
        <input
          type="text"
          placeholder="Type a message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 border rounded px-3 py-2"
        />
        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Send
        </button>
      </form>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-4 w-full max-w-md max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-3">Media Preview</h2>

            {previewFiles.map((file, index) => (
              <div key={index} className="mb-6">
                {file.type.startsWith("image") ? (
                  <img
                    src={URL.createObjectURL(file)}
                    alt={`preview-${index}`}
                    className="w-full h-64 object-contain rounded mb-2"
                  />
                ) : (
                  <video
                    src={URL.createObjectURL(file)}
                    controls
                    className="w-full h-64 object-contain rounded mb-2"
                  />
                )}

                <input
                  type="text"
                  value={captions[index]}
                  onChange={(e) => handleCaptionChange(index, e.target.value)}
                  placeholder="Add a caption..."
                  className="w-full border px-3 py-2 rounded"
                />
              </div>
            ))}

            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400"
                onClick={() => {
                  setShowPreview(false);
                  setPreviewFiles([]);
                  setCaptions([]);
                }}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded bg-blue-500 text-white hover:bg-blue-600"
                onClick={handleUpload}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
