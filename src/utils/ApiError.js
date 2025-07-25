class ApiError extends Error {
  constructor(message = "Something went wrong", statusCode , error = [], statck = "") {
    super(message);
    this.statusCode = statusCode;
    this.data = null
    this.message = message;
    this.success = false;
    this.error = error; // Store additional error information
    if(statck) {
      this.stack = statck; // Store stack trace if provided
    }else{
        Error.captureStackTrace(this, this.constructor); // Capture stack trace
    }
}
}
export default ApiError;