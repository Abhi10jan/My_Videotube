import { Router } from "express";
import { publishAVideo , getAllVideos ,getVideoById , deleteVideo  ,updateVideo ,togglePublishStatus} from "../controllers/video.controller.js";
import {upload} from "../middlewares/multer.middleware.js"
import {verifyJWT} from "../middlewares/auth.middleware.js"

const router = Router()

router.route("/").get(getAllVideos)

router.use(verifyJWT); 

router.route("/").post(
    upload.fields([
        {
            name : "videoFile",
            maxCount : 1,
        },
        {
            name : "thumbnail",
            maxCount : 1,
        },
    ]),
    publishAVideo
);

router.route("/:videoId").get(getVideoById);
router.route("/:videoId").delete(deleteVideo);
router.put(
  "/:videoId",
  upload.fields([{ name: "thumbnail", maxCount: 1 }]),
  updateVideo
);

router.route("/toggle/publish/:videoId").patch(togglePublishStatus);
export default router;