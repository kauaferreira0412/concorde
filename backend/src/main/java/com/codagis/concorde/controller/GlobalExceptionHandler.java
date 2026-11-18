package com.codagis.concorde.controller;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleBadRequest(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(GlobalExceptionHandler::describe)
                .distinct()
                .collect(Collectors.joining(" "));
        return ResponseEntity.badRequest().body(Map.of("error", message.isBlank() ? "Dados inválidos" : message));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> handleUnreadable(HttpMessageNotReadableException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", "Requisição inválida"));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, String>> handleTooLarge(MaxUploadSizeExceededException ex) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(Map.of("error", "Arquivo grande demais - o máximo é 8MB"));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> handleConflict(DataIntegrityViolationException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "Já existe um registro com esses dados (nome de usuário ou email em uso?)"));
    }

    /** Mensagem em português pra cada campo inválido. */
    private static String describe(FieldError error) {
        String field = switch (error.getField()) {
            case "username" -> "Nome de usuário";
            case "email" -> "Email";
            case "password" -> "Senha";
            case "nickname" -> "Apelido";
            case "bio" -> "Sobre mim";
            default -> error.getField();
        };
        String code = error.getCode() == null ? "" : error.getCode();
        Object[] args = error.getArguments();
        return switch (code) {
            case "NotBlank", "NotNull", "NotEmpty" -> field + " é obrigatório.";
            case "Email" -> "Email inválido.";
            case "Size" -> sizeMessage(field, args);
            default -> field + " inválido.";
        };
    }

    // Para @Size, os argumentos vêm como [nome, max, min].
    private static String sizeMessage(String field, Object[] args) {
        if (args != null && args.length >= 3) {
            int max = ((Number) args[1]).intValue();
            int min = ((Number) args[2]).intValue();
            if (min > 0 && max < Integer.MAX_VALUE) return field + " precisa ter entre " + min + " e " + max + " caracteres.";
            if (min > 0) return field + " precisa ter pelo menos " + min + " caracteres.";
            return field + " pode ter no máximo " + max + " caracteres.";
        }
        return field + " com tamanho inválido.";
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> handleForbidden(IllegalStateException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", ex.getMessage()));
    }
}
