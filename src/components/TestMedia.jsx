import { useEffect } from "react";

export default function TestMedia() {
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        console.log("✅ Got stream:", stream);
      })
      .catch(err => {
        console.error("❌ Media error:", err.name, err.message);
      });
  }, []);

  return <div>Check console for camera/mic test</div>;
}
