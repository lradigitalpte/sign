package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type ObjectStore interface {
	Put(context.Context, string, io.Reader, int64, string) error
	Get(context.Context, string) (io.ReadCloser, error)
	Delete(context.Context, string) error
}

type MinIO struct {
	client *minio.Client
	bucket string
}

// NewMinIO connects to an S3-compatible endpoint and ensures the platform bucket exists.
func NewMinIO(ctx context.Context, endpoint, accessKey, secretKey, bucket string, secure bool) (*MinIO, error) {
	return openMinIO(ctx, endpoint, accessKey, secretKey, bucket, secure, true)
}

// OpenBucket connects to an existing customer bucket without creating it.
func OpenBucket(ctx context.Context, endpoint, accessKey, secretKey, bucket string, secure bool) (*MinIO, error) {
	return openMinIO(ctx, endpoint, accessKey, secretKey, bucket, secure, false)
}

func openMinIO(ctx context.Context, endpoint, accessKey, secretKey, bucket string, secure, ensureBucket bool) (*MinIO, error) {
	client, err := minio.New(endpoint, &minio.Options{Creds: credentials.NewStaticV4(accessKey, secretKey, ""), Secure: secure})
	if err != nil {
		return nil, err
	}
	exists, err := client.BucketExists(ctx, bucket)
	if err != nil {
		return nil, err
	}
	if !exists {
		if !ensureBucket {
			return nil, fmt.Errorf("bucket %q does not exist or is not accessible", bucket)
		}
		if err := client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, err
		}
	}
	return &MinIO{client: client, bucket: bucket}, nil
}

func (m *MinIO) Put(ctx context.Context, key string, body io.Reader, size int64, contentType string) error {
	_, err := m.client.PutObject(ctx, m.bucket, key, body, size, minio.PutObjectOptions{ContentType: contentType})
	return err
}

func (m *MinIO) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	object, err := m.client.GetObject(ctx, m.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	if _, err := object.Stat(); err != nil {
		object.Close()
		return nil, err
	}
	return object, nil
}

func (m *MinIO) Delete(ctx context.Context, key string) error {
	return m.client.RemoveObject(ctx, m.bucket, key, minio.RemoveObjectOptions{})
}

// Ping verifies put/get/delete access with a disposable probe object.
func (m *MinIO) Ping(ctx context.Context) error {
	key := ".signing-platform-connection-test"
	body := []byte("ok")
	if err := m.Put(ctx, key, bytes.NewReader(body), int64(len(body)), "text/plain"); err != nil {
		return fmt.Errorf("put probe object: %w", err)
	}
	reader, err := m.Get(ctx, key)
	if err != nil {
		_ = m.Delete(ctx, key)
		return fmt.Errorf("get probe object: %w", err)
	}
	_ = reader.Close()
	if err := m.Delete(ctx, key); err != nil {
		return fmt.Errorf("delete probe object: %w", err)
	}
	return nil
}
