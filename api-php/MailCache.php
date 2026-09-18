<?php
declare(strict_types=1);

final class MailCache
{
    private string $storageDir;
    private string $cachePath;
    private string $settingsPath;
    private string $lockPath;

    public function __construct(string $storageDir)
    {
        $this->storageDir = rtrim($storageDir, '/\\');
        if (!is_dir($this->storageDir) && !mkdir($this->storageDir, 0770, true) && !is_dir($this->storageDir)) {
            throw new RuntimeException('Storage klasörü oluşturulamadı.');
        }
        $this->cachePath = $this->storageDir . '/mail-cache.json';
        $this->settingsPath = $this->storageDir . '/settings.json';
        $this->lockPath = $this->storageDir . '/mail-refresh.lock';
    }

    public function getMailSnapshot(): ?array
    {
        return $this->readJson($this->cachePath);
    }

    public function saveMailSnapshot(array $snapshot): array
    {
        $this->atomicWriteJson($this->cachePath, $snapshot);
        return ['cachedAt' => $snapshot['cachedAt'] ?? null];
    }

    public function clearMailSnapshot(): void
    {
        if (is_file($this->cachePath) && !unlink($this->cachePath)) {
            throw new RuntimeException('Mail cache temizlenemedi.');
        }
    }

    public function getMailSettings(): ?array
    {
        return $this->readJson($this->settingsPath);
    }

    public function saveMailSettings(array $settings): array
    {
        $clean = [
            'gendec' => (string) ($settings['gendec'] ?? ''),
            'ldm' => (string) ($settings['ldm'] ?? ''),
            'tripInfo' => (string) ($settings['tripInfo'] ?? ''),
        ];
        $this->atomicWriteJson($this->settingsPath, $clean);
        return $clean;
    }

    public function withRefreshLock(callable $callback): mixed
    {
        $handle = fopen($this->lockPath, 'c+');
        if ($handle === false) {
            throw new RuntimeException('Mail refresh lock açılamadı.');
        }
        try {
            if (!flock($handle, LOCK_EX)) {
                throw new RuntimeException('Mail refresh lock alınamadı.');
            }
            return $callback();
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    private function readJson(string $path): ?array
    {
        if (!is_file($path)) {
            return null;
        }
        $raw = file_get_contents($path);
        if ($raw === false || trim($raw) === '') {
            return null;
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : null;
    }

    private function atomicWriteJson(string $path, array $data): void
    {
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        if ($json === false) {
            throw new RuntimeException('JSON cache oluşturulamadı.');
        }
        $tmp = tempnam($this->storageDir, '.gbeyan-');
        if ($tmp === false) {
            throw new RuntimeException('Geçici cache dosyası oluşturulamadı.');
        }
        try {
            if (file_put_contents($tmp, $json, LOCK_EX) === false) {
                throw new RuntimeException('Cache dosyası yazılamadı.');
            }
            @chmod($tmp, 0660);
            if (!rename($tmp, $path)) {
                throw new RuntimeException('Cache dosyası atomik olarak güncellenemedi.');
            }
        } finally {
            if (is_file($tmp)) {
                @unlink($tmp);
            }
        }
    }
}
