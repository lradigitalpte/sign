package httpapi

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"io"
	"net/http"
	"signing-platform/internal/identity"
	"signing-platform/internal/securetoken"
	"signing-platform/internal/storage"
	"strings"
	"time"
)

const maxSecurityPDFSize int64 = 25 << 20

type pdfSecurityAPI struct {
	db      *pgxpool.Pool
	objects storage.Resolver
	vault   *securetoken.Protector
}
type securedFile struct {
	ID              string    `json:"id"`
	Filename        string    `json:"filename"`
	SourceFilename  string    `json:"sourceFilename"`
	Operation       string    `json:"operation"`
	SizeBytes       int64     `json:"sizeBytes"`
	SHA256          string    `json:"sha256"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
	PasswordVersion int       `json:"passwordVersion"`
	PasswordStatus  string    `json:"passwordStatus"`
}

func readSecurityUpload(w http.ResponseWriter, r *http.Request) ([]byte, string, error) {
	r.Body = http.MaxBytesReader(w, r.Body, maxSecurityPDFSize+(1<<20))
	if err := r.ParseMultipartForm(maxSecurityPDFSize); err != nil {
		return nil, "", errors.New("invalid or oversized upload")
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		return nil, "", errors.New("PDF file is required")
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxSecurityPDFSize+1))
	if err != nil || len(data) == 0 || int64(len(data)) > maxSecurityPDFSize {
		return nil, "", errors.New("PDF must be between 1 byte and 25 MB")
	}
	if !bytes.HasPrefix(data, []byte("%PDF-")) {
		return nil, "", errors.New("file is not a PDF")
	}
	return data, header.Filename, nil
}
func securityFilename(name, suffix string) string {
	base := strings.TrimSuffix(name, ".pdf")
	if base == "" {
		base = "document"
	}
	return base + suffix + ".pdf"
}
func (a *pdfSecurityAPI) routes(r chi.Router) {
	r.Post("/encrypt", a.process("encrypt"))
	r.Post("/decrypt", a.process("decrypt"))
	r.Post("/verify", a.verify)
	r.Get("/files", a.list)
	r.Route("/files/{fileID}", func(r chi.Router) {
		r.Get("/", a.get)
		r.Delete("/", a.delete)
		r.Get("/download", a.download)
		r.Post("/password/reveal", a.reveal)
		r.Get("/passwords", a.passwords)
		r.Post("/password/rotate", a.rotate)
		r.Delete("/passwords/{version}", a.deletePassword)
	})
}

func (a *pdfSecurityAPI) passwords(w http.ResponseWriter, r *http.Request) {
	s, _ := identity.SessionFromContext(r.Context())
	rows, err := a.db.Query(r.Context(), `SELECT p.version,p.password_ciphertext,p.status,p.created_at,p.retired_at FROM pdf_security_password_versions p JOIN pdf_security_files f ON f.id=p.file_id WHERE f.id=$1 AND f.organization_id=$2 AND f.deleted_at IS NULL ORDER BY p.version DESC`, chi.URLParam(r, "fileID"), s.Workspace.ID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "unable to list password history"})
		return
	}
	defer rows.Close()
	values := []map[string]any{}
	for rows.Next() {
		var version int
		var cipher []byte
		var status string
		var created time.Time
		var retired *time.Time
		if rows.Scan(&version, &cipher, &status, &created, &retired) != nil {
			continue
		}
		item := map[string]any{"version": version, "status": status, "createdAt": created, "retiredAt": retired}
		if status != "deleted" {
			if plain, e := a.vault.Decrypt(cipher); e == nil {
				item["password"] = string(plain)
			}
		}
		values = append(values, item)
	}
	writeJSON(w, 200, map[string]any{"data": values})
}

func (a *pdfSecurityAPI) rotate(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Password string `json:"password"`
	}
	if json.NewDecoder(r.Body).Decode(&input) != nil || len(input.Password) < 8 {
		writeJSON(w, 400, map[string]string{"error": "new password must be at least 8 characters"})
		return
	}
	s, _ := identity.SessionFromContext(r.Context())
	fileID := chi.URLParam(r, "fileID")
	var key string
	var oldCipher []byte
	var version int
	err := a.db.QueryRow(r.Context(), `SELECT f.object_key,p.password_ciphertext,p.version FROM pdf_security_files f JOIN pdf_security_password_versions p ON p.file_id=f.id AND p.status='active' WHERE f.id=$1 AND f.organization_id=$2 AND f.deleted_at IS NULL ORDER BY p.version DESC LIMIT 1`, fileID, s.Workspace.ID).Scan(&key, &oldCipher, &version)
	if err != nil {
		writeJSON(w, 404, map[string]string{"error": "active encrypted file password not found"})
		return
	}
	old, err := a.vault.Decrypt(oldCipher)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "unable to unlock password vault"})
		return
	}
	source, err := func() (io.ReadCloser, error) {
		store, err := a.objects.For(r.Context(), s.Workspace.ID)
		if err != nil {
			return nil, err
		}
		return store.Get(r.Context(), key)
	}()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "unable to read secured PDF"})
		return
	}
	data, _ := io.ReadAll(source)
	source.Close()
	var plain bytes.Buffer
	if api.Decrypt(bytes.NewReader(data), &plain, model.NewAESConfiguration(string(old), string(old), 256)) != nil {
		writeJSON(w, 400, map[string]string{"error": "stored PDF could not be unlocked"})
		return
	}
	var encrypted bytes.Buffer
	if api.Encrypt(bytes.NewReader(plain.Bytes()), &encrypted, model.NewAESConfiguration(input.Password, input.Password, 256)) != nil {
		writeJSON(w, 500, map[string]string{"error": "unable to rotate PDF password"})
		return
	}
	body := encrypted.Bytes()
	store, err := a.objects.For(r.Context(), s.Workspace.ID)
	if err != nil || store.Put(r.Context(), key, bytes.NewReader(body), int64(len(body)), "application/pdf") != nil {
		writeJSON(w, 500, map[string]string{"error": "unable to store rotated PDF"})
		return
	}
	cipher, _ := a.vault.Encrypt([]byte(input.Password))
	sum := sha256.Sum256(body)
	tx, _ := a.db.Begin(r.Context())
	defer tx.Rollback(r.Context())
	_, err = tx.Exec(r.Context(), `UPDATE pdf_security_password_versions SET status='retired',retired_at=now() WHERE file_id=$1 AND status='active'`, fileID)
	if err == nil {
		_, err = tx.Exec(r.Context(), `INSERT INTO pdf_security_password_versions(file_id,version,password_ciphertext,created_by) VALUES($1,$2,$3,$4)`, fileID, version+1, cipher, s.User.ID)
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `UPDATE pdf_security_files SET size_bytes=$2,sha256=$3,updated_at=now() WHERE id=$1`, fileID, len(body), hex.EncodeToString(sum[:]))
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `INSERT INTO pdf_security_events(file_id,actor_id,event_type,metadata) VALUES($1,$2,'password_rotated',jsonb_build_object('fromVersion',$3,'toVersion',$4))`, fileID, s.User.ID, version, version+1)
	}
	if err != nil || tx.Commit(r.Context()) != nil {
		writeJSON(w, 500, map[string]string{"error": "unable to save password rotation"})
		return
	}
	writeJSON(w, 200, map[string]any{"version": version + 1, "password": input.Password})
}

func (a *pdfSecurityAPI) deletePassword(w http.ResponseWriter, r *http.Request) {
	s, _ := identity.SessionFromContext(r.Context())
	tag, err := a.db.Exec(r.Context(), `UPDATE pdf_security_password_versions p SET status='deleted',password_ciphertext='\x'::bytea,deleted_at=now() FROM pdf_security_files f WHERE p.file_id=f.id AND f.id=$1 AND f.organization_id=$2 AND p.version=$3 AND p.status='retired'`, chi.URLParam(r, "fileID"), s.Workspace.ID, chi.URLParam(r, "version"))
	if err != nil || tag.RowsAffected() == 0 {
		writeJSON(w, 400, map[string]string{"error": "only retired password versions can be deleted"})
		return
	}
	w.WriteHeader(204)
}
func (a *pdfSecurityAPI) process(action string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data, source, err := readSecurityUpload(w, r)
		if err != nil {
			writeJSON(w, 400, map[string]string{"error": err.Error()})
			return
		}
		password := r.FormValue("password")
		if password == "" {
			writeJSON(w, 400, map[string]string{"error": "password is required"})
			return
		}
		var output bytes.Buffer
		conf := model.NewAESConfiguration(password, password, 256)
		filename := ""
		if action == "encrypt" {
			err = api.Encrypt(bytes.NewReader(data), &output, conf)
			filename = securityFilename(source, "-encrypted")
		} else {
			err = api.Decrypt(bytes.NewReader(data), &output, conf)
			filename = securityFilename(strings.TrimSuffix(source, "-encrypted.pdf")+".pdf", "-decrypted")
		}
		if err != nil {
			writeJSON(w, 400, map[string]string{"error": "Unable to process PDF. Check the file and password."})
			return
		}
		session, _ := identity.SessionFromContext(r.Context())
		id := uuid.NewString()
		key := "pdf-security/" + session.Workspace.ID + "/" + id + ".pdf"
		body := output.Bytes()
		store, err := a.objects.For(r.Context(), session.Workspace.ID)
		if err != nil {
			writeJSON(w, 500, map[string]string{"error": "unable to store secured PDF"})
			return
		}
		if err = store.Put(r.Context(), key, bytes.NewReader(body), int64(len(body)), "application/pdf"); err != nil {
			writeJSON(w, 500, map[string]string{"error": "unable to store secured PDF"})
			return
		}
		digest := sha256.Sum256(body)
		secret, err := a.vault.Encrypt([]byte(password))
		if err != nil {
			writeJSON(w, 500, map[string]string{"error": "unable to protect password"})
			return
		}
		tx, err := a.db.Begin(r.Context())
		if err != nil {
			writeJSON(w, 500, map[string]string{"error": "unable to save file"})
			return
		}
		defer tx.Rollback(r.Context())
		operation := action + "ed"
		_, err = tx.Exec(r.Context(), `INSERT INTO pdf_security_files(id,organization_id,created_by,filename,object_key,size_bytes,sha256,operation,source_filename) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, id, session.Workspace.ID, session.User.ID, filename, key, len(body), hex.EncodeToString(digest[:]), operation, source)
		if err == nil {
			_, err = tx.Exec(r.Context(), `INSERT INTO pdf_security_password_versions(file_id,version,password_ciphertext,created_by) VALUES($1,1,$2,$3)`, id, secret, session.User.ID)
		}
		if err == nil {
			_, err = tx.Exec(r.Context(), `INSERT INTO pdf_security_events(file_id,actor_id,event_type) VALUES($1,$2,$3)`, id, session.User.ID, operation)
		}
		if err != nil || tx.Commit(r.Context()) != nil {
			writeJSON(w, 500, map[string]string{"error": "unable to save secured file record"})
			return
		}
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
		w.Header().Set("X-PDF-Security-File-ID", id)
		w.WriteHeader(200)
		_, _ = w.Write(body)
	}
}
func (a *pdfSecurityAPI) verify(w http.ResponseWriter, r *http.Request) {
	data, filename, err := readSecurityUpload(w, r)
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	sum := sha256.Sum256(data)
	err = api.Validate(bytes.NewReader(data), model.NewDefaultConfiguration())
	writeJSON(w, 200, map[string]any{"filename": filename, "valid": err == nil, "sha256": hex.EncodeToString(sum[:]), "sizeBytes": len(data)})
}

const securedFileSelect = `SELECT f.id::text,f.filename,f.source_filename,f.operation,f.size_bytes,f.sha256,f.created_at,f.updated_at,COALESCE(p.version,0),COALESCE(p.status,'') FROM pdf_security_files f LEFT JOIN LATERAL (SELECT version,status FROM pdf_security_password_versions WHERE file_id=f.id AND status<>'deleted' ORDER BY version DESC LIMIT 1) p ON true`

func scanSecured(row pgx.Row) (securedFile, error) {
	var f securedFile
	err := row.Scan(&f.ID, &f.Filename, &f.SourceFilename, &f.Operation, &f.SizeBytes, &f.SHA256, &f.CreatedAt, &f.UpdatedAt, &f.PasswordVersion, &f.PasswordStatus)
	return f, err
}
func (a *pdfSecurityAPI) list(w http.ResponseWriter, r *http.Request) {
	s, _ := identity.SessionFromContext(r.Context())
	rows, err := a.db.Query(r.Context(), securedFileSelect+` WHERE f.organization_id=$1 AND f.deleted_at IS NULL ORDER BY f.created_at DESC`, s.Workspace.ID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "unable to list files"})
		return
	}
	defer rows.Close()
	out := []securedFile{}
	for rows.Next() {
		f, e := scanSecured(rows)
		if e == nil {
			out = append(out, f)
		}
	}
	writeJSON(w, 200, map[string]any{"data": out})
}
func (a *pdfSecurityAPI) file(w http.ResponseWriter, r *http.Request) (securedFile, bool) {
	s, _ := identity.SessionFromContext(r.Context())
	f, err := scanSecured(a.db.QueryRow(r.Context(), securedFileSelect+` WHERE f.id=$1 AND f.organization_id=$2 AND f.deleted_at IS NULL`, chi.URLParam(r, "fileID"), s.Workspace.ID))
	if err != nil {
		writeJSON(w, 404, map[string]string{"error": "secured file not found"})
		return f, false
	}
	return f, true
}
func (a *pdfSecurityAPI) get(w http.ResponseWriter, r *http.Request) {
	f, ok := a.file(w, r)
	if ok {
		writeJSON(w, 200, f)
	}
}
func (a *pdfSecurityAPI) delete(w http.ResponseWriter, r *http.Request) {
	s, _ := identity.SessionFromContext(r.Context())
	tag, err := a.db.Exec(r.Context(), `UPDATE pdf_security_files SET deleted_at=now(),updated_at=now() WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL`, chi.URLParam(r, "fileID"), s.Workspace.ID)
	if err != nil || tag.RowsAffected() == 0 {
		writeJSON(w, 404, map[string]string{"error": "secured file not found"})
		return
	}
	w.WriteHeader(204)
}
func (a *pdfSecurityAPI) reveal(w http.ResponseWriter, r *http.Request) {
	s, _ := identity.SessionFromContext(r.Context())
	var cipher []byte
	var version int
	err := a.db.QueryRow(r.Context(), `SELECT p.password_ciphertext,p.version FROM pdf_security_password_versions p JOIN pdf_security_files f ON f.id=p.file_id WHERE f.id=$1 AND f.organization_id=$2 AND f.deleted_at IS NULL AND p.status='active' ORDER BY p.version DESC LIMIT 1`, chi.URLParam(r, "fileID"), s.Workspace.ID).Scan(&cipher, &version)
	if err != nil {
		writeJSON(w, 404, map[string]string{"error": "active password not found"})
		return
	}
	plain, err := a.vault.Decrypt(cipher)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "unable to reveal password"})
		return
	}
	_, _ = a.db.Exec(r.Context(), `INSERT INTO pdf_security_events(file_id,actor_id,event_type) VALUES($1,$2,'password_revealed')`, chi.URLParam(r, "fileID"), s.User.ID)
	writeJSON(w, 200, map[string]any{"password": string(plain), "version": version})
}
func (a *pdfSecurityAPI) download(w http.ResponseWriter, r *http.Request) {
	f, ok := a.file(w, r)
	if !ok {
		return
	}
	var key string
	_ = a.db.QueryRow(r.Context(), `SELECT object_key FROM pdf_security_files WHERE id=$1`, f.ID).Scan(&key)
	s, _ := identity.SessionFromContext(r.Context())
	store, err := a.objects.For(r.Context(), s.Workspace.ID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "unable to download file"})
		return
	}
	body, err := store.Get(r.Context(), key)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "unable to download file"})
		return
	}
	defer body.Close()
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `inline; filename="`+f.Filename+`"`)
	_, _ = io.Copy(w, body)
}
