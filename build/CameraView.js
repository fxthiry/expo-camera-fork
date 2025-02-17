import { Platform, UnavailabilityError } from 'expo-modules-core';
import { Component, createRef } from 'react';
import ExpoCamera from './ExpoCamera';
import CameraManager from './ExpoCameraManager';
import { ConversionTables, ensureNativeProps } from './utils/props';
const EventThrottleMs = 500;
const _PICTURE_SAVED_CALLBACKS = {};
let loggedRenderingChildrenWarning = false;
let _GLOBAL_PICTURE_ID = 1;
function ensurePictureOptions(options) {
    if (!options || typeof options !== 'object') {
        return {};
    }
    if (options.quality === undefined) {
        options.quality = 1;
    }
    if (options.mirror) {
        console.warn('The `mirror` option is deprecated. Please use the `mirror` prop on the `CameraView` instead.');
    }
    if (options.onPictureSaved) {
        const id = _GLOBAL_PICTURE_ID++;
        _PICTURE_SAVED_CALLBACKS[id] = options.onPictureSaved;
        options.id = id;
        options.fastMode = true;
    }
    return options;
}
function ensureRecordingOptions(options = {}) {
    if (!options || typeof options !== 'object') {
        return {};
    }
    if (options.mirror) {
        console.warn('The `mirror` option is deprecated. Please use the `mirror` prop on the `CameraView` instead.');
    }
    return options;
}
function _onPictureSaved({ nativeEvent, }) {
    const { id, data } = nativeEvent;
    const callback = _PICTURE_SAVED_CALLBACKS[id];
    if (callback) {
        callback(data);
        delete _PICTURE_SAVED_CALLBACKS[id];
    }
}
export default class CameraView extends Component {
    /**
     * Property that determines if the current device has the ability to use `DataScannerViewController` (iOS 16+).
     */
    static isModernBarcodeScannerAvailable = CameraManager.isModernBarcodeScannerAvailable;
    /**
     * Check whether the current device has a camera. This is useful for web and simulators cases.
     * This isn't influenced by the Permissions API (all platforms), or HTTP usage (in the browser).
     * You will still need to check if the native permission has been accepted.
     * @platform web
     */
    static async isAvailableAsync() {
        if (!CameraManager.isAvailableAsync) {
            throw new UnavailabilityError('expo-camera', 'isAvailableAsync');
        }
        return CameraManager.isAvailableAsync();
    }
    // @needsAudit
    /**
     * Queries the device for the available video codecs that can be used in video recording.
     * @return A promise that resolves to a list of strings that represents available codecs.
     * @platform ios
     */
    static async getAvailableVideoCodecsAsync() {
        if (!CameraManager.getAvailableVideoCodecsAsync) {
            throw new UnavailabilityError('Camera', 'getAvailableVideoCodecsAsync');
        }
        return CameraManager.getAvailableVideoCodecsAsync();
    }
    /**
     * Get picture sizes that are supported by the device.
     * @return Returns a Promise that resolves to an array of strings representing picture sizes that can be passed to `pictureSize` prop.
     * The list varies across Android devices but is the same for every iOS.
     */
    async getAvailablePictureSizesAsync() {
        return (await this._cameraRef.current?.getAvailablePictureSizes()) ?? [];
    }
    /**
     * Returns an object with the supported features of the camera on the current device.
     */
    getSupportedFeatures() {
        return {
            isModernBarcodeScannerAvailable: CameraManager.isModernBarcodeScannerAvailable,
            toggleRecordingAsyncAvailable: CameraManager.toggleRecordingAsyncAvailable,
        };
    }
    /**
     * Resumes the camera preview.
     */
    async resumePreview() {
        return this._cameraRef.current?.resumePreview();
    }
    /**
     * Pauses the camera preview. It is not recommended to use `takePictureAsync` when preview is paused.
     */
    async pausePreview() {
        return this._cameraRef.current?.pausePreview();
    }
    // Values under keys from this object will be transformed to native options
    static ConversionTables = ConversionTables;
    static defaultProps = {
        zoom: 0,
        facing: 'back',
        enableTorch: false,
        mode: 'picture',
        flash: 'off',
    };
    _cameraHandle;
    _cameraRef = createRef();
    _lastEvents = {};
    _lastEventsTimes = {};
    async takePictureAsync(options) {
        const pictureOptions = ensurePictureOptions(options);
        return this._cameraRef.current?.takePicture(pictureOptions);
    }
    /**
     * On Android, we will use the [Google code scanner](https://developers.google.com/ml-kit/vision/barcode-scanning/code-scanner).
     * On iOS, presents a modal view controller that uses the [`DataScannerViewController`](https://developer.apple.com/documentation/visionkit/scanning_data_with_the_camera) available on iOS 16+.
     * @platform android
     * @platform ios
     */
    static async launchScanner(options) {
        if (!options) {
            options = { barcodeTypes: [] };
        }
        if (Platform.OS !== 'web' && CameraView.isModernBarcodeScannerAvailable) {
            await CameraManager.launchScanner(options);
        }
    }
    /**
     * Dismiss the scanner presented by `launchScanner`.
     * > **info** On Android, the scanner is dismissed automatically when a barcode is scanned.
     * @platform ios
     */
    static async dismissScanner() {
        if (Platform.OS !== 'web' && CameraView.isModernBarcodeScannerAvailable) {
            await CameraManager.dismissScanner();
        }
    }
    /**
     * Invokes the `listener` function when a bar code has been successfully scanned. The callback is provided with
     * an object of the `ScanningResult` shape, where the `type` refers to the bar code type that was scanned and the `data` is the information encoded in the bar code
     * (in this case of QR codes, this is often a URL). See [`BarcodeType`](#barcodetype) for supported values.
     * @param listener Invoked with the [ScanningResult](#scanningresult) when a bar code has been successfully scanned.
     *
     * @platform ios
     * @platform android
     */
    static onModernBarcodeScanned(listener) {
        return CameraManager.addListener('onModernBarcodeScanned', listener);
    }
    /**
     * Starts recording a video that will be saved to cache directory. Videos are rotated to match device's orientation.
     * Flipping camera during a recording results in stopping it.
     * @param options A map of `CameraRecordingOptions` type.
     * @return Returns a Promise that resolves to an object containing video file `uri` property and a `codec` property on iOS.
     * The Promise is returned if `stopRecording` was invoked, one of `maxDuration` and `maxFileSize` is reached or camera preview is stopped.
     * @platform android
     * @platform ios
     */
    async recordAsync(options) {
        const recordingOptions = ensureRecordingOptions(options);
        return this._cameraRef.current?.record(recordingOptions);
    }
    /**
     * Pauses or resumes the video recording. Only has an effect if there is an active recording. On `iOS`, this method only supported on `iOS` 18.
     *
     * @example
     * ```ts
     * const { toggleRecordingAsyncAvailable } = getSupportedFeatures()
     *
     * return (
     *  {toggleRecordingAsyncAvailable && (
     *    <Button title="Toggle Recording" onPress={toggleRecordingAsync} />
     *  )}
     * )
     * ```
     */
    async toggleRecordingAsync() {
        return this._cameraRef.current?.toggleRecording();
    }
    /**
     * Stops recording if any is in progress.
     */
    stopRecording() {
        this._cameraRef.current?.stopRecording();
    }
    _onCameraReady = () => {
        if (this.props.onCameraReady) {
            this.props.onCameraReady();
        }
    };
    _onMountError = ({ nativeEvent }) => {
        if (this.props.onMountError) {
            this.props.onMountError(nativeEvent);
        }
    };
    _onResponsiveOrientationChanged = ({ nativeEvent, }) => {
        if (this.props.onResponsiveOrientationChanged) {
            this.props.onResponsiveOrientationChanged(nativeEvent);
        }
    };
    _onObjectDetected = (callback) => ({ nativeEvent }) => {
        const { type } = nativeEvent;
        if (this._lastEvents[type] &&
            this._lastEventsTimes[type] &&
            JSON.stringify(nativeEvent) === this._lastEvents[type] &&
            new Date().getTime() - this._lastEventsTimes[type].getTime() < EventThrottleMs) {
            return;
        }
        if (callback) {
            callback(nativeEvent);
            this._lastEventsTimes[type] = new Date();
            this._lastEvents[type] = JSON.stringify(nativeEvent);
        }
    };
    _setReference = (ref) => {
        if (ref) {
            // TODO(Bacon): Unify these - perhaps with hooks?
            if (Platform.OS === 'web') {
                this._cameraHandle = ref;
            }
        }
    };
    render() {
        const nativeProps = ensureNativeProps(this.props);
        const onBarcodeScanned = this.props.onBarcodeScanned
            ? this._onObjectDetected(this.props.onBarcodeScanned)
            : undefined;
        // @ts-expect-error
        if (nativeProps.children && !loggedRenderingChildrenWarning) {
            console.warn('The <CameraView> component does not support children. This may lead to inconsistent behaviour or crashes. If you want to render content on top of the Camera, consider using absolute positioning.');
            loggedRenderingChildrenWarning = true;
        }
        return (<ExpoCamera {...nativeProps} ref={this._cameraRef} onCameraReady={this._onCameraReady} onMountError={this._onMountError} onBarcodeScanned={onBarcodeScanned} onPictureSaved={_onPictureSaved} onResponsiveOrientationChanged={this._onResponsiveOrientationChanged}/>);
    }
}
//# sourceMappingURL=CameraView.js.map