import mongoose, { isValidObjectId } from "mongoose"
import { Video } from "../models/video.model.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { ApiError } from "../utils/ApiError.js"
import { deleteOnCloudinary, uploadOnCloudinary } from "../utils/cloudinary.js"
import {User} from "../models/user.model.js"


const getAllVideos = asyncHandler(async ( req , res) => {
    const {page = 1 , limit = 10 , query , sortBy  , sortType , userId} = req.query
    const pipeline = [];

    if (query) {
        pipeline.push({
            $search: {
                index: "search-videos",
                text: {
                    query: query,
                    path: ["title", "description"] 
                }
            }
        });
    }

    if (userId) {
        if (!isValidObjectId(userId)) {
            throw new ApiError(400, "Invalid userId");
        }

        pipeline.push({
            $match: {
                owner: userId
            }
        });
    }

    pipeline.push({ $match: { isPublished: true } });

    if (sortBy && sortType) {
        pipeline.push({
            $sort: {
                [sortBy]: sortType === "asc" ? 1 : -1
            }
        });
    } else {
        pipeline.push({ $sort: { createdAt: -1 } });
    }

    pipeline.push(
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "ownerDetails",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            "avatar.url": 1
                        }
                    }
                ]
            }
        },
        {
            $unwind: "$ownerDetails"
        }

    )

    const videoAggregate = Video.aggregate(pipeline);

    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
    };

    const video = await Video.aggregatePaginate(videoAggregate, options);

    return res
        .status(200)
        .json(new ApiResponse(200, video, "Videos fetched successfully"));

});

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body
    if (!(title || description)) {
        throw new ApiError(400, "All fields are required")
    }

    const videoFileLocalPath = req.files?.videoFile[0]?.path;
    const thumbnailLocalPath = req.files?.thumbnail[0]?.path;

    if (!videoFileLocalPath || !thumbnailLocalPath) {
        throw new ApiError(400, "videoFile and thumbnail are required");
    }


    const videoFile = await uploadOnCloudinary(videoFileLocalPath, "video")
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath, "image")

    if (!videoFile) {
        throw new ApiError(400, "Video Not uploaded on cloudinary ")
    }
    if (!thumbnail) {
        throw new ApiError(400, "Thumbnail Not uploaded on cloudinary")
    }

    const video = await Video.create({
        videoFile: {
            url: videoFile.url,
            public_id: videoFile.public_id
        },
        thumbnail: {
            url: thumbnail.url,
            public_id: thumbnail.public_id
        },
        duration: videoFile.duration,
        title,
        description,
        owner: req.user?._id,
        isPublished: true
    })

    if (!video) {
        throw new ApiError(500, "something went wrong")
    }

    const videoUpload = await Video.findById(video.id)
    if (!videoUpload) {
        throw new ApiError(500, "video uploaded failed please try again !!!")
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                video,
                "Video uploaded successfully"
            ))
})

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    if (!isValidObjectId(req.user?._id)) {
        throw new ApiError(400, "Invalid userId");
    }

    const video = await Video.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(videoId)
            }
        },
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "video",
                as: "likes"
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    {
                        $lookup: {
                            from: "subscriptions",
                            localField: "_id",
                            foreignField: "channel",
                            as: "subscribers"
                        }
                    },
                    {
                        $addFields: {
                            subscribersCount: {
                                $size: "$subscribers"
                            },
                            isSubscribed: {
                                $cond: {
                                    if: {
                                        $in: [
                                            req.user?._id,
                                            "$subscribers.subscriber"
                                        ]
                                    },
                                    then: true,
                                    else: false
                                }
                            }
                        }
                    },
                    {
                        $project: {
                            username: 1,
                            "avatar.url": 1,
                            subscribersCount: 1,
                            isSubscribed: 1
                        }
                    }
                ]
            }
        },
        {
            $addFields: {
                likesCount: {
                    $size: "$likes"
                },
                owner: {
                    $first: "$owner"
                },
                isLiked: {
                    $cond: {
                        if: { $in: [req.user?._id, "$likes.likedBy"] },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                "videoFile.url": 1,
                title: 1,
                description: 1,
                views: 1,
                createdAt: 1,
                duration: 1,
                comments: 1,
                owner: 1,
                likesCount: 1,
                isLiked: 1
            }
        }
    ]);

    if (!video || video.length === 0) {
        throw new ApiError(500, "Video not found");
    }

    // increment views if video fetched successfully
    await Video.findByIdAndUpdate(videoId, {
        $inc: {
            views: 1
        }
    });

    // add this video to user watch history
    await User.findByIdAndUpdate(req.user?._id, {
        $addToSet: {
            watchHistory: videoId
        }
    });

    return res
        .status(200)
        .json(
            new ApiResponse(200, video[0], "video details fetched successfully")
        );
});

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video id")
    }

    const video = await Video.findById(videoId)
    if (!video) {
        throw new ApiError(400, "No video found")
    }

    if (video?.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(400, "You can't delete this video as you are not the owner")
    }

    const videoToDelete = await Video.findByIdAndDelete(video?._id)

    if (!videoToDelete) {
        throw new ApiError(500, "Failed to delete video please try again")
    }

    await deleteOnCloudinary(video.thumbnail.public_id)
    await deleteOnCloudinary(video.videoFile.public_id, "video");

    return res
        .status(200)
        .json(new ApiError(200, {}, "video deleted successfully"))
})

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: update video details like title, description, thumbnail
    const { title, description } = req.body;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video id")
    }
    if (!(title && description)) {
        throw new ApiError(400, "title and description are required");
    }

    const video = await Video.findById(videoId)

    if (!video) {
        throw new ApiError(404, "No video found")
    }

    if (video?.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(400, "You can't edit this video as you are not the owner")
    }

    //delete old thumbnail and updating with new thumbnail
    const thumbnailToDelete = video.thumbnail.public_id;

    const thumbnailLocalpath = req.files?.thumbnail[0]?.path;
    if (!thumbnailLocalpath) {
        throw new ApiError(400, "thumbnail is required");
    }

    const thumbnail = await uploadOnCloudinary(thumbnailLocalpath)

    if (!thumbnail) {
        throw new ApiError(500, "something went wrong while uploading thumbnail on cloudinary")
    }

    const updatedVideo = await Video.findByIdAndUpdate(
        videoId,
        {
            $set: {
                title,
                description,
                thumbnail: {
                    url: thumbnail.url,
                    public_id: thumbnail.public_id
                }
            }
        },
        { new: true }
    )

    if (!updateVideo) {
        throw new ApiError(500, "Failed to update video details, please try again")
    }

    //delete old thumbnail after updating new thumbnail
    await deleteOnCloudinary(thumbnailToDelete);

    return res
        .status(200)
        .json(new ApiResponse(
            200,
            updatedVideo,
            "Video details updated successfully"
        ))
})

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "invalid video id")
    }

    const video = await Video.findById(videoId)

    if (!video) {
        throw new ApiError(400, "No video found")
    }

    if (video.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(400, "You can't toggle publish status as you are not owner")
    }

    const toggledVideoPublish = await Video.findByIdAndUpdate(
        videoId,
        {
            $set: {
                isPublished: !video?.isPublished
            }
        },
        { new: true }
    )

    if (!toggledVideoPublish) {
        throw new ApiError(500, "Failed to toggle video publish status")
    }

    return res
        .status(200)
        .json(new ApiResponse(200, { isPublished: toggledVideoPublish.isPublished }, "video published toggled successfully"))
})
export {
    publishAVideo , getAllVideos , getVideoById , deleteVideo , updateVideo , togglePublishStatus
}