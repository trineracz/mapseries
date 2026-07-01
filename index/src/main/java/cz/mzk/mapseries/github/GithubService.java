package cz.mzk.mapseries.github;

import cz.mzk.mapseries.Constants;
import cz.mzk.mapseries.Pair;
import cz.mzk.mapseries.managers.AdminManager;
import java.io.IOException;
import java.io.Serializable;
import java.net.URI;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Calendar;
import java.util.LinkedList;
import java.util.List;
import javax.ejb.EJB;
import javax.enterprise.context.SessionScoped;
import javax.inject.Inject;
import javax.inject.Named;
import javax.servlet.http.HttpSession;
import org.apache.commons.io.IOUtils;
import org.apache.http.Consts;
import org.apache.http.NameValuePair;
import org.apache.http.client.entity.UrlEncodedFormEntity;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.client.utils.URIBuilder;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.message.BasicNameValuePair;
import org.eclipse.egit.github.core.Blob;
import org.eclipse.egit.github.core.Commit;
import org.eclipse.egit.github.core.CommitUser;
import org.eclipse.egit.github.core.Reference;
import org.eclipse.egit.github.core.Repository;
import org.eclipse.egit.github.core.Tree;
import org.eclipse.egit.github.core.TreeEntry;
import org.eclipse.egit.github.core.TypedResource;
import org.eclipse.egit.github.core.User;
import org.eclipse.egit.github.core.client.GitHubClient;
import org.eclipse.egit.github.core.service.DataService;
import org.eclipse.egit.github.core.service.RepositoryService;
import org.eclipse.egit.github.core.service.UserService;
import org.jboss.logging.Logger;
import org.json.JSONObject;

/**
 * @author Erich Duda <dudaerich@gmail.com>
 */
@Named
@SessionScoped
public class GithubService implements Serializable {
    
    private static final Logger LOG = Logger.getLogger(GithubService.class);
    
    @Inject
    private HttpSession httpSession;
    
    @EJB
    private AdminManager adminManager;
    
    private String token;
    private String userName;
    private String login;
    
    public String authenticate(String code) throws Exception {
        
        try {
        
            URI githubUri = new URIBuilder()
                        .setScheme("https")
                        .setHost("github.com")
                        .setPath("/login/oauth/access_token")
                        .build();

            List<NameValuePair> params = new ArrayList<>();
            params.add(new BasicNameValuePair("client_id", Constants.GITHUB_CLIENT_ID));
            params.add(new BasicNameValuePair("client_secret", Constants.GITHUB_CLIENT_SECRET));
            params.add(new BasicNameValuePair("code", code));
            UrlEncodedFormEntity entity = new UrlEncodedFormEntity(params, Consts.UTF_8);
            HttpPost httpPost = new HttpPost(githubUri);
            httpPost.setEntity(entity);
            httpPost.addHeader("Accept", "application/json");
            httpPost.addHeader("Accept-Charset", "utf-8");
            
            CloseableHttpClient httpClient = HttpClients.createDefault();
            
            CloseableHttpResponse httpResponse = httpClient.execute(httpPost);

            String jsonString = IOUtils.toString(
                    httpResponse.getEntity().getContent(),
                    "UTF-8");
            JSONObject jsonObject = new JSONObject(jsonString);
            if (jsonObject.has("access_token")) {
                
                token = jsonObject.getString("access_token");
                
                return token;
            } else {
                String error = jsonObject.optString("error", "Unexpected error");
                throw new Exception(error);
            }
        } catch (Exception e) {
            throw new Exception(e);
        }
        
    }
    
    public void logout() {
        httpSession.invalidate();
    }
    
    public boolean isAuthenticate() {
        return token != null;
    }
    
    public boolean isAdmin() {
        String login = getLogin();
        
        return adminManager.isAdmin(login);
        
    }
    
    public String getUserName() {
        if (userName == null) {
            UserService service = new UserService(getGithubClient());
            try {
                userName = service.getUser().getName();
            } catch (IOException e) {
                LOG.error(e.getMessage(), e);
                userName = "";
            }
        }
        
        return userName;
    }
    
    public String getLogin() {
        
        if (login == null) {
            UserService service = new UserService(getGithubClient());
            try {
                login = service.getUser().getLogin();
            } catch (IOException e) {
                LOG.error(e.getMessage(), e);
                login = "";
            }
        }
        
        return login;
        
    }
    
    public void saveFile(String commitMessage, String path, String content) throws Exception {
        GitHubClient githubClient = getGithubClient();
        DataService dataService = new DataService(githubClient);
        RepositoryService repositoryService = new RepositoryService(githubClient);
        UserService userService = new UserService(githubClient);
        User user = userService.getUser();

        // Commit to the WRITE repo (our fork), never the production read repo.
        Repository repository = repositoryService.getRepository(Constants.REPO_WRITE_USER, Constants.REPO_WRITE_NAME);

        Blob blob = new Blob();
        blob.setContent(content);
        blob.setEncoding("utf-8");
        String blobSha = dataService.createBlob(repository, blob);
        
        TreeEntry treeEntry = new TreeEntry();
        treeEntry.setSha(blobSha);
        treeEntry.setPath(path);
        treeEntry.setType("blob");
        treeEntry.setMode("100644");
        
        Reference reference = dataService.getReference(repository, "heads/master");
        Commit masterCommit = dataService.getCommit(repository, reference.getObject().getSha());
        
        Tree tree = dataService.createTree(repository, Arrays.asList(treeEntry), masterCommit.getTree().getSha());
        CommitUser commitUser = new CommitUser();
        commitUser.setDate(Calendar.getInstance().getTime());
        commitUser.setName(getOrDefault(user.getName(), "anonymous"));
        commitUser.setEmail(getOrDefault(user.getEmail(), "anonym@site.com"));
        
        Commit commit = new Commit();
        commit.setMessage(commitMessage);
        commit.setParents(Arrays.asList(masterCommit));
        commit.setTree(tree);
        commit.setAuthor(commitUser);
        commit.setCommitter(commitUser);
        
        Commit newCommit = dataService.createCommit(repository, commit);
        TypedResource typedResource = new TypedResource();
        typedResource.setSha(newCommit.getSha());
        Reference newReference = new Reference();
        newReference.setRef(reference.getRef());
        newReference.setObject(typedResource);
        dataService.editReference(repository, newReference);
    }
    
    public String loadFile(String path) throws Exception {
        GitHubClient githubClient = getGithubClient();
        DataService dataService = new DataService(githubClient);
        RepositoryService repositoryService = new RepositoryService(githubClient);
        
        Repository repository = repositoryService.getRepository(Constants.REPO_USER, Constants.REPO_NAME);
        Reference reference = dataService.getReference(repository, "heads/master");
        Tree tree = dataService.getTree(repository, reference.getObject().getSha());
        
        LinkedList<Pair<String, TreeEntry>> front = new LinkedList<>();
        
        for (TreeEntry treeEntry : tree.getTree()) {
            front.addFirst(new Pair<>("", treeEntry));
        }
        
        while (!front.isEmpty()) {
            Pair<String, TreeEntry> pair = front.removeLast();

            if ("tree".equals(pair.getRight().getType())) {
                Tree t = dataService.getTree(repository, pair.getRight().getSha());
                for (TreeEntry te : t.getTree()) {
                    front.addFirst(new Pair<>(String.format("%s/%s", pair.getLeft(), pair.getRight().getPath()), te));
                }
            } else {
                String treePath = String.format("%s/%s", pair.getLeft(), pair.getRight().getPath());
                if (path.equals(treePath)) {
                    Blob blob = dataService.getBlob(repository, pair.getRight().getSha());
                    String content = blob.getContent().replaceAll("\\s+", "");
                    return new String(Base64.getDecoder().decode(content));
                }
            }
            
        }
        
        return null;
    }
    
    private GitHubClient getGithubClient() {
        GitHubClient gitHubClient = new GitHubClient();
        
        String githubToken = getGithubToken();
        if (githubToken != null) {
            gitHubClient.setOAuth2Token(githubToken);
        }
       
        return gitHubClient;
    }
    
    private String getGithubToken() {
        if (token == null) {
            return null; 
        } else {
            return token;
        }
    }
    
    private static String getOrDefault(String val, String def) {
        if (val == null) {
            return def;
        }
        return val;
    }
    
}
