const asyncHandler = (requestHandler) => {
    return (req, res, next) => {
        Promise.resolve(requestHandler(req, res, next))
            .catch((error) => next(error));
    }
}

export { asyncHandler };

// const asyncHandler = (fn)=>(req , res , next) =>{
//     try {
//     }
//     catch (error) {
//        res.status(500).json({
//            success: false,   
//             message: error.message || "Internal Server Error"
//          });
//     }
// }
