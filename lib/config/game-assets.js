const gameAssetUrls = {
    pearGuideImageUrl: ''
};
const isPublicImageUrl = (value) => /^https?:\/\/\S+$/i.test(value.trim());

export { gameAssetUrls, isPublicImageUrl };
