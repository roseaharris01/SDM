namespace KonKon.DownloadManager.App.Models;

public enum DownloadStatus
{
    Queued,
    Downloading,
    Paused,
    Completed,
    Failed,
    Canceled
}
