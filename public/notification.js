const notificationPanel = document.getElementById('notification-panel');

// Function to hide the notification panel after 10 seconds
function hideNotification() {
    if (notificationPanel) {
        setTimeout(() => {
            notificationPanel.style.opacity = 0;
        }, 2000); // 10000 milliseconds = 10 seconds
        setTimeout(() => {
            notificationPanel.style.display = 'none';
        }, 10000); // 10000 milliseconds = 10 seconds
    }
}

// Call the hideNotification function to start the timer
hideNotification();