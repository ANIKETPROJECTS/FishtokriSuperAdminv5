module.exports = {
  apps: [
    {
      name: "fishtokri-api",
      script: "./artifacts/api-server/dist/index.mjs",
      cwd: "/var/www/fishtokri",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 8080,
        MONGODB_URI: "mongodb+srv://raneaniket23_db_user:0lEZL6KqIATNmZsj@fishtokricluster.vhw7jp9.mongodb.net/?appName=Fishtokricluster",
        SESSION_SECRET: "N+sLoTPRIVALoyG9KZg8BEhKC9NNxOSlqfNCDEyxEMIej55cNCHOE1bjIaGh+VFlDXgg9Oh8Wbtgr73PTjkfDQ==",
        CLOUDINARY_CLOUD_NAME: "dbkmmxnzd",
        CLOUDINARY_API_KEY: "935594792745712",
        CLOUDINARY_API_SECRET: "ouFPGE7SlNoQAG_OR7IT5sdFiiU",
      },
    },
  ],
};
