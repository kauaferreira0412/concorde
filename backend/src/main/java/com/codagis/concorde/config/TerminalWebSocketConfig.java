package com.codagis.concorde.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

/** WebSocket "cru" do terminal da VPS (separado do STOMP do chat em /ws). */
@Configuration
@EnableWebSocket
public class TerminalWebSocketConfig implements WebSocketConfigurer {

    private final TerminalWebSocketHandler terminalHandler;

    public TerminalWebSocketConfig(TerminalWebSocketHandler terminalHandler) {
        this.terminalHandler = terminalHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // a autenticação é a 1ª mensagem (token + senha), não cookie - por isso não depende de origem
        registry.addHandler(terminalHandler, "/ws/terminal").setAllowedOriginPatterns("*");
    }

    /** Permite colar textos maiores no terminal (o padrão do Tomcat é 8KB por mensagem). */
    @Bean
    public ServletServerContainerFactoryBean webSocketContainer() {
        ServletServerContainerFactoryBean container = new ServletServerContainerFactoryBean();
        container.setMaxTextMessageBufferSize(256 * 1024);
        container.setMaxBinaryMessageBufferSize(256 * 1024);
        return container;
    }
}
