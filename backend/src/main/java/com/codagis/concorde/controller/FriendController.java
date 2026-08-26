package com.codagis.concorde.controller;

import com.codagis.concorde.dto.FriendDtos.FriendInfo;
import com.codagis.concorde.dto.FriendDtos.FriendRequestInfo;
import com.codagis.concorde.dto.FriendDtos.FriendRequestsResponse;
import com.codagis.concorde.dto.FriendDtos.SendFriendRequestBody;
import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.FriendshipService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/friends")
public class FriendController {

    private final FriendshipService friendshipService;
    private final CurrentUser currentUser;

    public FriendController(FriendshipService friendshipService, CurrentUser currentUser) {
        this.friendshipService = friendshipService;
        this.currentUser = currentUser;
    }

    @GetMapping
    public List<FriendInfo> list() {
        return friendshipService.listFriends(currentUser.id());
    }

    @GetMapping("/requests")
    public FriendRequestsResponse requests() {
        return friendshipService.listRequests(currentUser.id());
    }

    @PostMapping("/requests")
    public void send(@RequestBody SendFriendRequestBody body) {
        friendshipService.sendRequest(currentUser.id(), body.username());
    }

    @PostMapping("/requests/{otherUserId}/accept")
    public void accept(@PathVariable Long otherUserId) {
        friendshipService.accept(currentUser.id(), otherUserId);
    }

    @PostMapping("/requests/{otherUserId}/decline")
    public void decline(@PathVariable Long otherUserId) {
        friendshipService.decline(currentUser.id(), otherUserId);
    }

    @DeleteMapping("/{friendUserId}")
    public void remove(@PathVariable Long friendUserId) {
        friendshipService.remove(currentUser.id(), friendUserId);
    }

    @GetMapping("/blocked")
    public List<FriendRequestInfo> blocked() {
        return friendshipService.listBlocked(currentUser.id());
    }

    @PostMapping("/{userId}/block")
    public void block(@PathVariable Long userId) {
        friendshipService.block(currentUser.id(), userId);
    }

    @PostMapping("/{userId}/unblock")
    public void unblock(@PathVariable Long userId) {
        friendshipService.unblock(currentUser.id(), userId);
    }
}
