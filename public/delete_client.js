// Find all elements with class 'delete'
const deleteButtons = document.querySelectorAll('.delete');

const editButtons = document.querySelectorAll('.edit');

// Loop through each delete button and add event listener
deleteButtons.forEach(button => {
    button.addEventListener('click', function() {
        //
        const id = button.dataset.id;
        // Handle delete button click event
        console.log(`Delete button clicked! ${id}`);
        // Add your delete logic here
        fetch(`clients/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                // Add any additional headers if needed
            },
            // You can include a request body if required
            // body: JSON.stringify({}),
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                // Handle successful deletion
                console.log('Item deleted successfully');
                if (window)
                    window.location.reload()
            })
            .catch(error => {
                // Handle error
                console.error('Error deleting item:', error);
            });
    });
});

editButtons.forEach(button => {
    button.addEventListener('click', function() {
        //
        const id = button.dataset.id;
        // Handle delete button click event
        console.log(`Edit button clicked! ${id}`);
        //
        window.location.href = `/edit_client/${id}`
    });
})