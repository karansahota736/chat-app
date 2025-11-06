import React, { useEffect, useState } from "react";

export default function Sidebar({ onSelectChat }) {
  const [users, setUsers] = useState([]);
  
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const loggedInUser = JSON.parse(localStorage.getItem("user"));
const response = await fetch(`${process.env.REACT_APP_API_URL}/api/users`, {
  headers: {
    "Accept": "application/json",
    "ngrok-skip-browser-warning": "true"
  }
});  
      const data = await response.json();
        
        // Filter out current user
        const filteredUsers = data.filter(user => user.id !== loggedInUser.id);
        
        setUsers(filteredUsers);
      } catch (error) {
        console.error("Failed to fetch users", error);
      }
    };
    
    fetchUsers();
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-white border-r">
      <div className="p-4 font-bold text-xl border-b">Chats</div>
      {users.length === 0 ? (
        <div className="p-4 text-gray-500">No other users found.</div>
      ) : (
        users.map((user) => (
          <div
            key={user.id}
            className="p-4 hover:bg-gray-100 cursor-pointer border-b"
            onClick={() => onSelectChat(user)}
          >
            <div className="font-medium">{user.name}</div>
            <div className="text-sm text-gray-500 truncate">{user.email}</div>
          </div>
        ))
      )}
    </div>
  );
}
