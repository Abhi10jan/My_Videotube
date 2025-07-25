class ApiResponse{
    constructor(statusCode , message = "Success") {
        this.statusCode = statusCode;
        this.success = statusCode < 400
        this.message = message;
        this.data = data // Initialize data to null
    }
}