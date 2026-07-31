export class VideoPlayer {
  constructor() {
    this.playerElement = null;
    this.videoElement = null;
    this.fullScreenButtonElement = null;
  }

  /**
   * @param {Element} playerElement parent element for create video player
   */
  createPlayer(playerElement) {
    this.playerElement = playerElement;

    this.videoElement = document.createElement('video');
    this.videoElement.id = 'Video';
    this.videoElement.playsInline = true;
    this.videoElement.srcObject = new MediaStream();
    this.videoElement.addEventListener('loadedmetadata', this._onLoadedVideo.bind(this), true);
    this.playerElement.appendChild(this.videoElement);

    // add fullscreen button
    this.fullScreenButtonElement = document.createElement('img');
    this.fullScreenButtonElement.id = 'fullscreenButton';
    this.fullScreenButtonElement.src = 'images/FullScreen.png';
    this.fullScreenButtonElement.addEventListener("click", this._onClickFullscreenButton.bind(this));
    this.playerElement.appendChild(this.fullScreenButtonElement);

    document.addEventListener('webkitfullscreenchange', this._onFullscreenChange.bind(this));
    document.addEventListener('fullscreenchange', this._onFullscreenChange.bind(this));
  }

  _onLoadedVideo() {
    this.videoElement.play();
  }

  _onClickFullscreenButton() {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      return;
    }

    if (this.playerElement.requestFullscreen) {
      this.playerElement.requestFullscreen();
    } else if (this.playerElement.webkitRequestFullscreen) {
      this.playerElement.webkitRequestFullscreen();
    }
  }

  _onFullscreenChange() {
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
    this.fullScreenButtonElement.style.display = isFullscreen ? 'none' : 'block';
  }

  /**
   * @param {MediaStreamTrack} track
   */
  addTrack(track) {
    if (!this.videoElement.srcObject) {
      return;
    }

    this.videoElement.srcObject.addTrack(track);
  }

  deletePlayer() {
    while (this.playerElement.firstChild) {
      this.playerElement.removeChild(this.playerElement.firstChild);
    }

    this.playerElement = null;
    this.videoElement = null;
    this.fullScreenButtonElement = null;
  }
}
